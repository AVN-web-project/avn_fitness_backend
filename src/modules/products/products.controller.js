import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import { Product } from '../../models/product.model.js';
import { Inventory } from '../../models/inventory.model.js';
import { Category } from '../../models/category.model.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/apiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { recordActivityLog } from '../../middlewares/activityLogger.middleware.js';
import { ACTIVITY_ACTIONS, ENTITY_TYPES, PRODUCT_STATUS } from '../../config/constants.js';

export const getProducts = asyncHandler(async (req, res) => {
  const {
    category,
    subCategory,
    ageGroup,
    gender,
    minPrice,
    maxPrice,
    search,
    q,
    sort,
    page = 1,
    limit = 20,
    status,
  } = req.query;

  const filter = {};

    // For staff/admin management, return all products (both active & inactive) unless specific status requested
  const isManagement = req.user || req.admin;
  if (isManagement) {
    if (status && status !== 'all') {
      filter.status = status;
    }
    // If no specific status query, do not restrict filter.status so all products are displayed in admin
  } else {
    // For public customer storefront, only show active products
    filter.status = PRODUCT_STATUS.ACTIVE;
  }

  // Flexible category filter (supports slug, case-insensitive name, or ALL)
  if (category && category.toUpperCase() !== 'ALL PRODUCTS' && category.toUpperCase() !== 'ALL') {
    const formattedSlug = category.toLowerCase().trim().replace(/\s+/g, '-');
    const categoryDoc = await Category.findOne({
      $or: [
        { slug: formattedSlug },
        { name: new RegExp(`^${category.trim()}$`, 'i') },
      ],
    });
    if (categoryDoc) {
      filter.category = categoryDoc._id;
    }
  }

  if (subCategory) {
    const subCategoryDoc = await Category.findOne({ slug: subCategory });
    if (subCategoryDoc) {
      filter.subCategory = subCategoryDoc._id;
    }
  }

  // Demographics
  if (ageGroup && ageGroup.toUpperCase() !== 'ALL') {
    filter.ageGroup = new RegExp(`^${ageGroup}$`, 'i');
  }
  if (gender && gender.toUpperCase() !== 'ALL') {
    filter.gender = new RegExp(`^${gender}$`, 'i');
  }

  // Search keyword (supports 'search' or 'q' parameters with partial word matching)
  const searchQuery = (search || q || '').trim();
  if (searchQuery) {
    const searchRegex = new RegExp(searchQuery, 'i');
    filter.$or = [
      { name: searchRegex },
      { description: searchRegex },
      { tagline: searchRegex },
      { tags: searchRegex },
      { 'specifications.value': searchRegex },
    ];
  }

  // Price filtering across variants
  if (minPrice || maxPrice) {
    filter['variants.price'] = {};
    if (minPrice) filter['variants.price'].$gte = Number(minPrice);
    if (maxPrice) filter['variants.price'].$lte = Number(maxPrice);
  }

  // Sorting
  let sortOption = { createdAt: -1 }; // default newest
  if (sort === 'price_asc') {
    sortOption = { 'variants.price': 1 };
  } else if (sort === 'price_desc') {
    sortOption = { 'variants.price': -1 };
  } else if (sort === 'rating_desc' || sort === 'reviews') {
    sortOption = { ratingsAverage: -1, ratingsCount: -1 };
  } else if (sort === 'newest') {
    sortOption = { createdAt: -1 };
  }

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate('category', 'name slug')
      .populate('subCategory', 'name slug')
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum),
    Product.countDocuments(filter),
  ]);

  return ApiResponse.success(
    res,
    {
      products,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    },
    'Products retrieved successfully'
  );
});

export const getProductBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const isObjectId = mongoose.Types.ObjectId.isValid(slug);

  const product = await Product.findOne({
    $or: [
      { slug: slug.toLowerCase() },
      ...(isObjectId ? [{ _id: slug }] : []),
    ],
  })
    .populate('category', 'name slug')
    .populate('subCategory', 'name slug')
    .populate('relatedProducts', 'name slug images variants ratingsAverage');

  if (!product) {
    throw ApiError.notFound(`Product with identifier '${slug}' not found`);
  }

  // For public customers, block discontinued items from direct shopping
  if (
    (!req.user || req.user.role === 'user') &&
    product.status === PRODUCT_STATUS.DISCONTINUED
  ) {
    throw ApiError.badRequest('This product has been discontinued and is no longer available.');
  }

  return ApiResponse.success(res, { product }, 'Product details retrieved successfully');
});

export const createProduct = asyncHandler(async (req, res) => {
  const {
    name,
    slug,
    description,
    tagline,
    badge,
    category,
    subCategory,
    ageGroup,
    gender,
    images,
    specifications,
    sizeGuide,
    careInstructions,
    variants,
    relatedProducts,
    tags,
    status,
    price,
    pricing,
  } = req.body;

  const generatedSlug = slug || slugify(name, { lower: true, strict: true });

  const existing = await Product.findOne({ slug: generatedSlug });
  if (existing) {
    throw ApiError.conflict('A product with this slug already exists.');
  }

  const normalizedVariants = variants && variants.length > 0 ? variants : [
    {
      sku: `${name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 4).toUpperCase()}-${Date.now().toString().slice(-4)}`,
      title: 'Standard',
      size: 'Standard',
      color: 'Standard',
      price: Number(price || pricing?.basePrice) || 499,
      compareAtPrice: Number(pricing?.compareAtPrice) || 0,
      stockQuantity: 50,
      isActive: true,
    }
  ];

  const primaryPrice = normalizedVariants[0]?.price || Number(price) || 499;

  const product = await Product.create({
    name,
    slug: generatedSlug,
    description,
    tagline: tagline || '',
    badge: badge || '',
    category,
    subCategory: subCategory || null,
    ageGroup: ageGroup || 'all',
    gender: gender || 'unisex',
    images: images && images.length > 0 ? images : [{ url: '/placeholder-product.png', altText: name, isPrimary: true }],
    specifications: specifications || [],
    sizeGuide,
    careInstructions: careInstructions || '',
    variants: normalizedVariants,
    relatedProducts: relatedProducts || [],
    tags: tags || [],
    status: status || PRODUCT_STATUS.ACTIVE,
    price: primaryPrice,
    pricing: {
      basePrice: primaryPrice,
      compareAtPrice: normalizedVariants[0]?.compareAtPrice || 0,
    },
  });

  // Sync initial variants into inventory_m collection
  for (const v of normalizedVariants) {
    if (v.sku) {
      await Inventory.findOneAndUpdate(
        { sku: v.sku.toUpperCase() },
        {
          product: product._id,
          productName: product.name,
          sku: v.sku.toUpperCase(),
          variantTitle: v.title || `${v.size || ''} ${v.color || ''}`.trim() || 'Standard',
          size: v.size || 'Standard',
          color: v.color || 'Standard',
          stockQuantity: Number(v.stockQuantity) || 0,
          price: Number(v.price) || 0,
          isAvailable: v.isActive !== false,
          lastRestockedAt: new Date(),
        },
        { upsert: true }
      );
    }
  }

  await recordActivityLog({
    user: req.user,
    action: ACTIVITY_ACTIONS.PRODUCT_CREATED,
    targetEntity: ENTITY_TYPES.PRODUCT,
    targetEntityId: product._id,
    details: { name: product.name, slug: product.slug, variantCount: normalizedVariants.length },
    ipAddress: req.ip,
  });

  return ApiResponse.success(res, { product }, 'Product created successfully', 201);
});

export const updateProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const product = await Product.findById(id);

  if (!product) {
    throw ApiError.notFound('Product not found');
  }

  // Update allowed fields
  const allowedUpdates = [
    'name',
    'slug',
    'description',
    'tagline',
    'badge',
    'category',
    'subCategory',
    'ageGroup',
    'gender',
    'status',
    'images',
    'specifications',
    'sizeGuide',
    'careInstructions',
    'variants',
    'relatedProducts',
    'tags',
    'price',
    'pricing',
  ];

  allowedUpdates.forEach((field) => {
    if (req.body[field] !== undefined) {
      product[field] = req.body[field];
    }
  });

  await product.save();

  // Dual-sync variants to inventory_m collection
  if (product.variants && product.variants.length > 0) {
    for (const v of product.variants) {
      if (v.sku) {
        await Inventory.findOneAndUpdate(
          { sku: v.sku.toUpperCase() },
          {
            product: product._id,
            productName: product.name,
            sku: v.sku.toUpperCase(),
            variantTitle: v.title || `${v.size || ''} ${v.color || ''}`.trim() || 'Standard',
            size: v.size || 'Standard',
            color: v.color || 'Standard',
            stockQuantity: Number(v.stockQuantity) || 0,
            price: Number(v.price) || 0,
            isAvailable: v.isActive !== false,
            lastRestockedAt: new Date(),
          },
          { upsert: true }
        );
      }
    }
  }

  await recordActivityLog({
    user: req.user,
    action: ACTIVITY_ACTIONS.PRODUCT_UPDATED,
    targetEntity: ENTITY_TYPES.PRODUCT,
    targetEntityId: product._id,
    details: { updatedFields: Object.keys(req.body) },
    ipAddress: req.ip,
  });

  return ApiResponse.success(res, { product }, 'Product updated successfully');
});

export const updateProductStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!Object.values(PRODUCT_STATUS).includes(status)) {
    throw ApiError.badRequest(`Invalid status '${status}'. Allowed: ${Object.values(PRODUCT_STATUS).join(', ')}`);
  }

  const product = await Product.findById(id);
  if (!product) {
    throw ApiError.notFound('Product not found');
  }

  const previousStatus = product.status;
  product.status = status;
  await product.save();

  await recordActivityLog({
    user: req.user,
    action: ACTIVITY_ACTIONS.PRODUCT_STATUS_CHANGED,
    targetEntity: ENTITY_TYPES.PRODUCT,
    targetEntityId: product._id,
    details: { previousStatus, newStatus: status },
    ipAddress: req.ip,
  });

  return ApiResponse.success(res, { product }, `Product status changed from '${previousStatus}' to '${status}'`);
});

/**
 * Update stock inventory for a SKU
 */
export const updateInventory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { sku, stockQuantity } = req.body;

  const product = await Product.findById(id);
  if (!product) {
    throw ApiError.notFound('Product not found');
  }

  const variant = product.variants.find((v) => v.sku === sku);
  if (!variant) {
    throw ApiError.notFound(`Variant with SKU '${sku}' not found on this product`);
  }

  const previousStock = variant.stockQuantity;
  variant.stockQuantity = Number(stockQuantity);
  await product.save();

  await recordActivityLog({
    user: req.user,
    action: ACTIVITY_ACTIONS.INVENTORY_UPDATED,
    targetEntity: ENTITY_TYPES.PRODUCT,
    targetEntityId: product._id,
    details: { sku, previousStock, newStock: stockQuantity },
    ipAddress: req.ip,
  });

  return ApiResponse.success(res, { product }, `Inventory for SKU '${sku}' updated to ${stockQuantity}`);
});


/**
 * Upload Product Image File (Base64 / Binary)
 * POST /api/v1/products/upload-image
 */
export const uploadProductImage = asyncHandler(async (req, res) => {
  const { imageBase64, fileName, altText } = req.body;

  if (!imageBase64) {
    throw ApiError.badRequest('Image data (base64) is required');
  }

  // Extract base64 payload and mime extension
  const matches = imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  let ext = 'png';
  let buffer;

  if (matches && matches.length === 3) {
    const mimeType = matches[1].toLowerCase();
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
    else if (mimeType.includes('webp')) ext = 'webp';
    else if (mimeType.includes('svg')) ext = 'svg';
    else if (mimeType.includes('gif')) ext = 'gif';
    buffer = Buffer.from(matches[2], 'base64');
  } else {
    buffer = Buffer.from(imageBase64, 'base64');
  }

  const cleanName = (fileName || 'product')
    .toLowerCase()
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-z0-9]/g, '-')
    .substring(0, 35);

  const uniqueName = `${cleanName}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}.${ext}`;
  const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'products');

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const filePath = path.join(uploadDir, uniqueName);
  fs.writeFileSync(filePath, buffer);

  const imageUrl = `/uploads/products/${uniqueName}`;

  return ApiResponse.success(
    res,
    {
      url: imageUrl,
      fileName: uniqueName,
      altText: altText || cleanName.replace(/-/g, ' '),
    },
    'Image file uploaded successfully'
  );
});
