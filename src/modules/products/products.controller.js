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

  // For public users, only show active products
  if (req.user && (req.user.role === 'admin' || req.user.role === 'operations') && status) {
    filter.status = status;
  } else {
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
  } = req.body;

  const generatedSlug = (slug || name).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  const existing = await Product.findOne({ slug: generatedSlug });
  if (existing) {
    throw ApiError.conflict('A product with this slug already exists.');
  }

  const product = await Product.create({
    name,
    slug: generatedSlug,
    description,
    category,
    subCategory: subCategory || null,
    ageGroup,
    gender,
    images: images || [],
    specifications: specifications || [],
    sizeGuide,
    careInstructions,
    variants,
    relatedProducts: relatedProducts || [],
    tags: tags || [],
    status: PRODUCT_STATUS.ACTIVE,
  });

  // Sync initial variants into inventory_m collection
  for (const v of variants) {
    await Inventory.findOneAndUpdate(
      { sku: v.sku },
      {
        product: product._id,
        productName: product.name,
        sku: v.sku,
        variantTitle: v.title || `${v.size || ''} ${v.color || ''}`.trim() || 'Standard',
        size: v.size || 'Standard',
        color: v.color || 'Standard',
        stockQuantity: Number(v.stockQuantity) || 0,
        price: Number(v.price) || 0,
        lastRestockedAt: new Date(),
      },
      { upsert: true }
    );
  }

  await recordActivityLog({
    user: req.user,
    action: ACTIVITY_ACTIONS.PRODUCT_CREATED,
    targetEntity: ENTITY_TYPES.PRODUCT,
    targetEntityId: product._id,
    details: { name: product.name, slug: product.slug, variantCount: variants.length },
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
    'description',
    'category',
    'subCategory',
    'ageGroup',
    'gender',
    'images',
    'specifications',
    'sizeGuide',
    'careInstructions',
    'variants',
    'relatedProducts',
    'tags',
  ];

  allowedUpdates.forEach((field) => {
    if (req.body[field] !== undefined) {
      product[field] = req.body[field];
    }
  });

  await product.save();

  // Dual-sync to inventory_m collection
  await Inventory.findOneAndUpdate(
    { sku },
    {
      product: product._id,
      productName: product.name,
      stockQuantity: Number(stockQuantity),
      lastRestockedAt: new Date(),
    },
    { upsert: true }
  );

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

/**
 * Status Transition enforcing Non-Deletion Policy
 */
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
