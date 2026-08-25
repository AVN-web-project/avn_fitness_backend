import { Category } from '../../models/category.model.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/apiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { recordActivityLog } from '../../middlewares/activityLogger.middleware.js';
import { ACTIVITY_ACTIONS, ENTITY_TYPES } from '../../config/constants.js';

export const getAllCategories = asyncHandler(async (req, res) => {
  const query = req.user && req.user.role === 'admin' ? {} : { isActive: true };
  const categories = await Category.find(query).populate('parentCategory', 'name slug').sort({ sortOrder: 1, name: 1 });

  return ApiResponse.success(res, { categories, count: categories.length }, 'Categories fetched successfully');
});

export const getCategoryBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const category = await Category.findOne({ slug: slug.toLowerCase() }).populate('parentCategory', 'name slug');

  if (!category) {
    throw ApiError.notFound(`Category with slug '${slug}' not found`);
  }

  // Find child subcategories
  const subCategories = await Category.find({ parentCategory: category._id, isActive: true });

  return ApiResponse.success(res, { category, subCategories }, 'Category fetched successfully');
});

export const createCategory = asyncHandler(async (req, res) => {
  const { name, slug, description, parentCategory, image, sortOrder } = req.body;

  const generatedSlug = (slug || name).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  const existing = await Category.findOne({ slug: generatedSlug });
  if (existing) {
    throw ApiError.conflict('Category with this slug already exists.');
  }

  const category = await Category.create({
    name,
    slug: generatedSlug,
    description,
    parentCategory: parentCategory || null,
    image,
    sortOrder: sortOrder || 0,
  });

  await recordActivityLog({
    user: req.user,
    action: ACTIVITY_ACTIONS.PRODUCT_CREATED,
    targetEntity: ENTITY_TYPES.CATEGORY,
    targetEntityId: category._id,
    details: { name: category.name, slug: category.slug },
    ipAddress: req.ip,
  });

  return ApiResponse.success(res, { category }, 'Category created successfully', 201);
});

export const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const category = await Category.findById(id);

  if (!category) {
    throw ApiError.notFound('Category not found');
  }

  Object.assign(category, req.body);
  await category.save();

  await recordActivityLog({
    user: req.user,
    action: ACTIVITY_ACTIONS.PRODUCT_UPDATED,
    targetEntity: ENTITY_TYPES.CATEGORY,
    targetEntityId: category._id,
    details: { updatedFields: req.body },
    ipAddress: req.ip,
  });

  return ApiResponse.success(res, { category }, 'Category updated successfully');
});
