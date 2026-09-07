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

  // Resolve target product by ObjectId or slug
  const product = await Product.findOne({
    $or: [
      { _id: productId.match(/^[0-9a-fA-F]{24}$/) ? productId : null },
      { slug: productId },
    ],
  });
  const targetProductId = product ? product._id : (productId.match(/^[0-9a-fA-F]{24}$/) ? productId : null);

  const filter = { product: targetProductId, status: REVIEW_STATUS.PUBLISHED };

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .populate('user', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Review.countDocuments(filter),
  ]);

  const currentUserId = req.user?._id ? req.user._id.toString() : null;

  const enrichedReviews = reviews.map((r) => ({
    ...r,
    hasVoted: currentUserId && Array.isArray(r.helpfulVotes)
      ? r.helpfulVotes.some((v) => v.toString() === currentUserId)
      : false,
  }));

  return ApiResponse.success(
    res,
    {
      reviews: enrichedReviews,
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

  const product = await Product.findOne({
    $or: [
      { _id: productId.match(/^[0-9a-fA-F]{24}$/) ? productId : null },
      { slug: productId },
    ],
  });
  if (!product) throw ApiError.notFound('Product not found');

  const existing = await Review.findOne({ product: product._id, user: req.user._id });
  if (existing) {
    throw ApiError.badRequest('You have already submitted a review for this product.');
  }

  // Check if verified purchase (delivered order containing this product)
  const verifiedOrder = await Order.findOne({
    user: req.user._id,
    $or: [
      { 'items.product': product._id },
      { 'items.productId': product.slug },
      { 'items.productId': product._id.toString() },
    ],
    orderStatus: ORDER_STATUS.DELIVERED,
  });

  const review = await Review.create({
    product: product._id,
    user: req.user._id,
    order: verifiedOrder ? verifiedOrder._id : null,
    rating,
    title,
    comment,
    images: images || [],
    status: REVIEW_STATUS.PUBLISHED,
    isVerifiedPurchase: !!verifiedOrder,
  });

  await updateProductRatingStats(product._id);

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

/**
 * Mark review as helpful (Allow only one upvote per user, toggle to undo)
 */
export const markReviewHelpful = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
    throw ApiError.badRequest('Invalid review ID');
  }

  const userId = req.user._id;

  // Check if review exists
  const existingReview = await Review.findById(id);
  if (!existingReview) {
    throw ApiError.notFound('Review not found');
  }

  const hasAlreadyVoted = Array.isArray(existingReview.helpfulVotes) &&
    existingReview.helpfulVotes.some((v) => v.toString() === userId.toString());

  let updatedReview;
  let hasVoted = false;

  if (hasAlreadyVoted) {
    // User has already voted -> Toggle off (undo helpful vote)
    updatedReview = await Review.findOneAndUpdate(
      { _id: id, helpfulVotes: userId },
      {
        $pull: { helpfulVotes: userId },
        $inc: { helpful: -1 },
      },
      { new: true }
    );
    hasVoted = false;
  } else {
    // User has not voted -> Add helpful vote (prevent duplicate via $ne filter)
    updatedReview = await Review.findOneAndUpdate(
      { _id: id, helpfulVotes: { $ne: userId } },
      {
        $addToSet: { helpfulVotes: userId },
        $inc: { helpful: 1 },
      },
      { new: true }
    );
    hasVoted = true;
  }

  // Fallback if atomic condition was raced
  if (!updatedReview) {
    updatedReview = await Review.findById(id);
    hasVoted = Array.isArray(updatedReview.helpfulVotes) &&
      updatedReview.helpfulVotes.some((v) => v.toString() === userId.toString());
  }

  // Ensure helpful counter never falls below 0
  if (updatedReview.helpful < 0) {
    updatedReview.helpful = 0;
    await updatedReview.save();
  }

  return ApiResponse.success(
    res,
    {
      id: updatedReview._id,
      helpful: updatedReview.helpful,
      hasVoted,
    },
    hasVoted ? 'Marked review as helpful' : 'Removed helpful vote'
  );
});

