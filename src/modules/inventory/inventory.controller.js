import { Product } from '../../models/product.model.js';
import { Inventory } from '../../models/inventory.model.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/apiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { recordActivityLog } from '../../middlewares/activityLogger.middleware.js';
import { ACTIVITY_ACTIONS, ENTITY_TYPES, LOG_DOMAINS } from '../../config/constants.js';
import { isObjectId } from '../../utils/ids.js';

/**
 * Get inventory derived directly from products collection & variants
 * GET /api/v1/inventory
 */
export const getInventory = asyncHandler(async (req, res) => {
  const { search, lowStock } = req.query;
  const threshold = 5;

  // The inventory ledger is the authority for SKUs. A row can exist there whose product variant
  // is missing, and a product can hold a variant with no ledger row. Reading only
  // products.variants — as this used to — silently hid every ledger-only row, which is why the
  // page showed 15 SKUs while the collection held 25.
  const [ledgerRows, products] = await Promise.all([
    Inventory.find({}).lean(),
    Product.find({})
      .populate('category', 'name slug')
      .select('_id name slug category price status isAvailable isPublished variants images image updatedAt')
      .lean(),
  ]);

  const productById = new Map(products.map((prod) => [String(prod._id), prod]));
  const rows = [];
  const seen = new Set();

  const push = (row) => {
    const key = String(row.sku || '').toUpperCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  };

  const primaryImage = (prod) =>
    (prod?.images && prod.images.find((i) => i.isPrimary)?.url) ||
    (prod?.images && prod.images[0]?.url) ||
    prod?.image ||
    null;

  // 1. every row in the ledger
  for (const inv of ledgerRows) {
    const prod = productById.get(String(inv.product));
    const variant = (prod?.variants || []).find((v) => v.sku === inv.sku);
    push({
      _id: inv._id,
      productId: inv.product || prod?._id || null,
      productName: inv.productName || prod?.name || 'Unknown product',
      productSlug: prod?.slug || null,
      productStatus: prod?.status || 'active',
      isProductActive: prod ? prod.status !== 'inactive' : true,
      category: prod?.category?.name || 'General Gear',
      sku: inv.sku,
      variantTitle: inv.variantTitle || variant?.title || `${inv.size || ''} ${inv.color || ''}`.trim() || 'Standard Variant',
      size: inv.size && inv.size !== 'undefined' ? inv.size : 'Standard',
      color: inv.color && inv.color !== 'undefined' ? inv.color : 'Standard',
      stockQuantity: Number(inv.stockQuantity) || 0,
      lowStockThreshold: Number(inv.lowStockThreshold) || threshold,
      price: Number(inv.price ?? variant?.price ?? prod?.price) || 0,
      isAvailable: inv.isAvailable !== false && (variant ? variant.isActive !== false : true),
      isPublished: prod?.isPublished,
      image: primaryImage(prod),
      images: prod?.images || [],
      lastRestockedAt: inv.lastRestockedAt || inv.updatedAt || prod?.updatedAt,
    });
  }

  // 2. any variant with no ledger row, so a missing ledger entry cannot hide a buyable SKU
  for (const prod of products) {
    for (const v of prod.variants || []) {
      push({
        _id: v._id || `${prod._id}_${v.sku}`,
        productId: prod._id,
        productName: prod.name,
        productSlug: prod.slug,
        productStatus: prod.status || 'active',
        isProductActive: prod.status !== 'inactive',
        category: prod.category?.name || 'General Gear',
        sku: v.sku,
        variantTitle: v.title || `${v.size || ''} ${v.color || ''}`.trim() || 'Standard Variant',
        size: v.size && v.size !== 'undefined' ? v.size : 'Standard',
        color: v.color && v.color !== 'undefined' ? v.color : 'Standard',
        stockQuantity: Number(v.stockQuantity !== undefined ? v.stockQuantity : v.stock) || 0,
        lowStockThreshold: threshold,
        price: Number(v.price) || Number(prod.price) || 0,
        isAvailable: prod.isAvailable !== false && v.isAvailable !== false && v.isActive !== false,
        isPublished: prod.isPublished,
        image: primaryImage(prod),
        images: prod.images || [],
        lastRestockedAt: prod.updatedAt,
      });
    }
  }

  // Counts cover the whole set, before any filter, so the stat tiles stay global.
  const totalSkus = rows.length;
  const outOfStockCount = rows.filter((r) => r.stockQuantity === 0).length;
  const lowStockCount = rows.filter(
    (r) => r.stockQuantity > 0 && r.stockQuantity <= (r.lowStockThreshold || threshold)
  ).length;
  const inactiveProductSkusCount = rows.filter(
    (r) => r.productStatus === 'inactive' || r.isProductActive === false
  ).length;

  let items = rows;
  if (search) {
    const s = String(search).toLowerCase();
    items = items.filter((r) =>
      [r.sku, r.productName, r.variantTitle, r.category].some((v) =>
        String(v || '').toLowerCase().includes(s)
      )
    );
  }
  if (lowStock === 'true' || lowStock === true) {
    items = items.filter((r) => r.stockQuantity <= (r.lowStockThreshold || threshold));
  }

  return ApiResponse.success(
    res,
    {
      items,
      total: items.length,
      totalSkus,
      lowStockCount,
      outOfStockCount,
      inactiveProductSkusCount,
    },
    'Inventory loaded from the inventory ledger'
  );
});

/**
 * Adjust stock for a product variant SKU
 * POST /api/v1/inventory/adjust or PATCH /api/v1/inventory/:sku
 */
export const adjustStock = asyncHandler(async (req, res) => {
  const targetSku = req.params.sku || req.body.sku;
  const { stockQuantity, newQuantity, delta, price, lowStockThreshold, isAvailable } = req.body;

  if (!targetSku) {
    throw ApiError.badRequest('SKU is required');
  }

  const product = await Product.findOne({ 'variants.sku': targetSku });
  const variant = product?.variants?.find((v) => v.sku === targetSku) || null;

  // A ledger-only SKU has no product variant behind it, but it is a real row the admin can see,
  // so it must be editable rather than answering 404.
  if (!product || !variant) {
    const ledgerRow = await Inventory.findOne({ sku: targetSku });
    if (!ledgerRow) {
      throw ApiError.notFound(`No variant or inventory row found for SKU '${targetSku}'`);
    }

    const previousStock = Number(ledgerRow.stockQuantity) || 0;
    let numeric = previousStock;
    if (stockQuantity !== undefined) numeric = Math.max(0, parseInt(stockQuantity, 10) || 0);
    else if (newQuantity !== undefined) numeric = Math.max(0, parseInt(newQuantity, 10) || 0);
    else if (delta !== undefined) numeric = Math.max(0, previousStock + (parseInt(delta, 10) || 0));

    ledgerRow.stockQuantity = numeric;
    if (price !== undefined && Number(price) >= 0) ledgerRow.price = Number(price);
    if (lowStockThreshold !== undefined && Number(lowStockThreshold) >= 0) {
      ledgerRow.lowStockThreshold = Number(lowStockThreshold);
    }
    if (isAvailable !== undefined) {
      ledgerRow.isAvailable = isAvailable === true || isAvailable === 'available' || isAvailable === 'true';
    }
    ledgerRow.lastRestockedAt = new Date();
    await ledgerRow.save();

    await recordActivityLog({
      user: req.user || req.admin,
      action: ACTIVITY_ACTIONS.INVENTORY_UPDATED,
      domain: LOG_DOMAINS.INVENTORY,
      targetEntity: ENTITY_TYPES.PRODUCT,
      targetEntityId: ledgerRow.product || null,
      details: {
        sku: ledgerRow.sku,
        productName: ledgerRow.productName,
        previousStock,
        newStock: numeric,
        context: `Ledger-only SKU ${ledgerRow.sku} updated to ${numeric} units`,
      },
      ipAddress: req.ip,
    });

    return ApiResponse.success(
      res,
      {
        sku: ledgerRow.sku,
        productName: ledgerRow.productName,
        stockQuantity: numeric,
        price: ledgerRow.price,
        isAvailable: ledgerRow.isAvailable !== false,
      },
      `Stock for ${ledgerRow.sku} updated to ${numeric}`
    );
  }

  const previousStock = variant.stockQuantity;
  const previousIsAvailable = variant.isAvailable !== false && variant.isActive !== false;
  let numericStock = previousStock;

  if (stockQuantity !== undefined) {
    numericStock = Math.max(0, parseInt(stockQuantity, 10) || 0);
  } else if (newQuantity !== undefined) {
    numericStock = Math.max(0, parseInt(newQuantity, 10) || 0);
  } else if (delta !== undefined) {
    numericStock = Math.max(0, previousStock + (parseInt(delta, 10) || 0));
  }

  variant.stockQuantity = numericStock;
  if (price !== undefined && Number(price) >= 0) {
    variant.price = Number(price);
  }
  if (isAvailable !== undefined) {
    const isAvail = isAvailable === true || isAvailable === 'available' || isAvailable === 'true';
    variant.isAvailable = isAvail;
    variant.isActive = isAvail;
  }

  await product.save();

  // Sync to inventory_m collection
  await Inventory.findOneAndUpdate(
    { sku: targetSku },
    {
      product: product._id,
      productName: product.name,
      sku: variant.sku,
      variantTitle: variant.title || `${variant.size || ''} ${variant.color || ''}`.trim() || 'Standard',
      size: variant.size || 'Standard',
      color: variant.color || 'Standard',
      stockQuantity: numericStock,
      price: variant.price || product.price || 0,
      lowStockThreshold: Number(lowStockThreshold) || 5,
      isAvailable: variant.isAvailable !== false && variant.isActive !== false,
      lastRestockedAt: new Date(),
    },
    { upsert: true }
  );

    const isStatusOnly = isAvailable !== undefined && stockQuantity === undefined && newQuantity === undefined && delta === undefined;
  const currentIsAvailable = variant.isAvailable !== false && variant.isActive !== false;
  const statusChanged = isAvailable !== undefined || previousIsAvailable !== currentIsAvailable;

  await recordActivityLog({
    user: req.user || req.admin,
    action: isStatusOnly ? ACTIVITY_ACTIONS.PRODUCT_STATUS_CHANGED : ACTIVITY_ACTIONS.INVENTORY_UPDATED,
    domain: LOG_DOMAINS.INVENTORY,
    targetEntity: ENTITY_TYPES.PRODUCT,
    targetEntityId: product._id,
    details: {
      sku: variant.sku,
      productName: product.name,
      previousStock,
      newStock: numericStock,
      previousStatus: previousIsAvailable ? 'Available' : 'Unavailable',
      newStatus: currentIsAvailable ? 'Available' : 'Unavailable',
      productStatus: currentIsAvailable ? 'Available' : 'Unavailable',
      statusChanged,
      context: isStatusOnly
        ? `Product status changed to ${currentIsAvailable ? 'Available (Ready for sale)' : 'Unavailable (Visible on storefront but not for sale)'}`
        : `Stock updated to ${numericStock} units (Status: ${currentIsAvailable ? 'Available' : 'Unavailable'})`,
    },
    ipAddress: req.ip,
  });

  return ApiResponse.success(
    res,
    {
      sku: variant.sku,
      productName: product.name,
      stockQuantity: numericStock,
      price: variant.price,
      isAvailable: variant.isAvailable !== false && variant.isActive !== false,
    },
    `Stock for ${variant.sku} (${product.name}) updated to ${numericStock}`
  );
});

export const updateInventoryStock = adjustStock;

export const updateInventoryItem = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { stockQuantity, price, lowStockThreshold } = req.body;

  let invItem = await Inventory.findOne({
    $or: [{ sku: id }, { _id: isObjectId(id) ? id : null }],
  });

  if (invItem) {
    if (stockQuantity !== undefined) invItem.stockQuantity = Number(stockQuantity);
    if (price !== undefined) invItem.price = Number(price);
    if (lowStockThreshold !== undefined) invItem.lowStockThreshold = Number(lowStockThreshold);
    invItem.lastRestockedAt = new Date();
    await invItem.save();

    if (invItem.product) {
      await Product.updateOne(
        { _id: invItem.product, 'variants.sku': invItem.sku },
        { $set: { 'variants.$.stockQuantity': invItem.stockQuantity } }
      );
    }

    return ApiResponse.success(res, { item: invItem }, 'Inventory item updated');
  }

  req.params.sku = id;
  return adjustStock(req, res);
});
