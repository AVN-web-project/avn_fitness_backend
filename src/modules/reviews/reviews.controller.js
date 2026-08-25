import { Review } from '../../models/review.model.js';
import { Product } from '../../models/product.model.js';
import { Order } from '../../models/order.model.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/apiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { recordActivityLog } from '../../middlewares/activityLogger.middleware.js';
import { ACTIVITY_ACTIONS, ENTITY_TYPES, ORDER_STATUS, REVIEW_STATUS } from '../../config/constants.js';

/**
 * Recompute ratings average and count for a product
 */
const updateProductRatingStats = async (productId) => {
  const stats = await Review.aggregate([
    { $match: { product: productId, status: REVIEW_STATUS.PUBLISHED } },
    {
      $group: {
        _id: '$product',
        avgRating: { $avg: '$rating' },
        numReviews: { $sum: 1 },
      },
    },
  ]);

  if (stats.length > 0) {
    await Product.findByIdAndUpdate(productId, {
      ratingsAverage: Math.round(stats[0].avgRating * 10) / 10,
      ratingsCount: stats[0].numReviews,
    });
  } else {
    await Product.findByIdAndUpdate(productId, {
      ratingsAverage: 0,
      ratingsCount: 0,
    });
  }
};

export const getProductReviews = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const filter = { product: productId, status: REVIEW_STATUS.PUBLISHED };

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .populate('user', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Review.countDocuments(filter),
  ]);

  return ApiResponse.success(
    res,
    {
      reviews,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    },
    'Product reviews retrieved'
  );
});

export const createReview = asyncHandler(async (req, res) => {
  const { productId, rating, title, comment, images } = req.body;

  const product = await Product.findById(productId);
  if (!product) throw ApiError.notFound('Product not found');

  const existing = await Review.findOne({ product: productId, user: req.user._id });
  if (existing) {
    throw ApiError.badRequest('You have already submitted a review for this product.');
  }

  // Check if verified purchase (delivered order containing this product)
  const verifiedOrder = await Order.findOne({
    user: req.user._id,
    'items.product': productId,
    orderStatus: ORDER_STATUS.DELIVERED,
  });

  const review = await Review.create({
    product: productId,
    user: req.user._id,
    order: verifiedOrder ? verifiedOrder._id : null,
    rating,
    title,
    comment,
    images: images || [],
    status: REVIEW_STATUS.PUBLISHED,
    isVerifiedPurchase: !!verifiedOrder,
  });

  await updateProductRatingStats(productId);

  return ApiResponse.success(res, { review }, 'Review submitted successfully', 201);
});

export const getAllReviewsForModeration = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const filter = {};

  if (status) filter.status = status;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .populate('product', 'name slug')
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Review.countDocuments(filter),
  ]);

  return ApiResponse.success(
    res,
    {
      reviews,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    },
    'Reviews queue fetched for moderation'
  );
});

export const moderateReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, moderationNotes } = req.body;

  if (!Object.values(REVIEW_STATUS).includes(status)) {
    throw ApiError.badRequest(`Invalid review status '${status}'. Allowed: ${Object.values(REVIEW_STATUS).join(', ')}`);
  }

  const review = await Review.findById(id);
  if (!review) throw ApiError.notFound('Review not found');

  const previousStatus = review.status;
  review.status = status;
  review.moderationNotes = moderationNotes || '';
  review.moderatedBy = req.user._id;
  await review.save();

  await updateProductRatingStats(review.product);

  await recordActivityLog({
    user: req.user,
    action: ACTIVITY_ACTIONS.REVIEW_MODERATED,
    targetEntity: ENTITY_TYPES.REVIEW,
    targetEntityId: review._id,
    details: { from: previousStatus, to: status, notes: moderationNotes },
    ipAddress: req.ip,
  });

  return ApiResponse.success(res, { review }, `Review status updated to '${status}'`);
});
