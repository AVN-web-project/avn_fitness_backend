import { Product } from '../../models/product.model.js';
import { Inventory } from '../../models/inventory.model.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/apiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { recordActivityLog } from '../../middlewares/activityLogger.middleware.js';
import { ACTIVITY_ACTIONS, ENTITY_TYPES, LOG_DOMAINS } from '../../config/constants.js';

/**
 * Get inventory derived directly from products collection & variants
 * GET /api/v1/inventory
 */
export const getInventory = asyncHandler(async (req, res) => {
  const { search, lowStock, page, limit = 50 } = req.query;

  const productFilter = {};
  if (search) {
    productFilter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { 'variants.sku': { $regex: search, $options: 'i' } },
      { 'variants.title': { $regex: search, $options: 'i' } },
    ];
  }

  const products = await Product.find(productFilter)
    .populate('category', 'name slug')
    .select('_id name slug category price status isAvailable isPublished variants images image updatedAt')
    .sort({ name: 1 })
    .lean();

  let inventoryList = [];
  for (const prod of products) {
    for (const v of prod.variants || []) {
      const stockQty = Number(v.stockQuantity !== undefined ? v.stockQuantity : v.stock || 0);
      const threshold = 5;

      if (search) {
        const s = search.toLowerCase();
        const matchesSku = v.sku && v.sku.toLowerCase().includes(s);
        const matchesName = prod.name && prod.name.toLowerCase().includes(s);
        const matchesTitle = v.title && v.title.toLowerCase().includes(s);
        const matchesCat = prod.category?.name && prod.category.name.toLowerCase().includes(s);
        if (!matchesSku && !matchesName && !matchesTitle && !matchesCat) continue;
      }

      if ((lowStock === 'true' || lowStock === true) && stockQty > threshold) {
        continue;
      }

      const primaryImage = (prod.images && prod.images.find(i => i.isPrimary)?.url) || (prod.images && prod.images[0]?.url) || prod.image || null;
      const isProdActive = prod.status !== 'inactive';
      inventoryList.push({
        _id: v._id || `${prod._id}_${v.sku}`,
        productId: prod._id,
        productName: prod.name,
        productSlug: prod.slug,
        productStatus: prod.status || 'active',
        isProductActive: isProdActive,
        category: prod.category?.name || 'General Gear',
        sku: v.sku,
        variantTitle: v.title || `${v.size || ''} ${v.color || ''}`.trim() || 'Standard Variant',
        size: v.size && v.size !== 'undefined' ? v.size : 'Standard',
        color: v.color && v.color !== 'undefined' ? v.color : 'Standard',
        stockQuantity: stockQty,
        lowStockThreshold: threshold,
        price: Number(v.price) || Number(prod.price) || 0,
        isAvailable: (prod.isAvailable !== false && v.isAvailable !== false && v.isActive !== false),
        isPublished: prod.isPublished,
        image: primaryImage,
        images: prod.images || [],
        lastRestockedAt: prod.updatedAt,
      });
    }
  }

  const allProducts = await Product.find({}).select('variants status').lean();
  let totalSkus = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let inactiveProductSkusCount = 0;

  for (const p of allProducts) {
    const isInactive = p.status === 'inactive';
    for (const v of p.variants || []) {
      totalSkus++;
      if (isInactive) inactiveProductSkusCount++;
      const qty = Number(v.stockQuantity !== undefined ? v.stockQuantity : v.stock || 0);
      if (qty === 0) outOfStockCount++;
      else if (qty <= 5) lowStockCount++;
    }
  }

  return ApiResponse.success(
    res,
    {
      items: inventoryList,
      total: inventoryList.length,
      totalSkus,
      lowStockCount,
      outOfStockCount,
      inactiveProductSkusCount,
    },
    'Inventory synchronized directly from products collection successfully'
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
  if (!product) {
    throw ApiError.notFound(`Product variant with SKU '${targetSku}' not found`);
  }

  const variant = product.variants.find((v) => v.sku === targetSku);
  if (!variant) {
    throw ApiError.notFound(`Variant with SKU '${targetSku}' not found`);
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
    $or: [{ sku: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
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
