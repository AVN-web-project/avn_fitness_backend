import { Router } from 'express';
import {
  createReview,
  getAllReviewsForModeration,
  getProductReviews,
  markReviewHelpful,
  moderateReview,
} from './reviews.controller.js';
import { optionalAuth, requireAuth, requireRole } from '../../middlewares/auth.middleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

// Public review listing for products (with optional user context for hasVoted)
router.get('/products/:productId', optionalAuth, getProductReviews);

// Customer review submission
router.post('/', requireAuth, createReview);

// Upvote review helpfulness (requires authenticated user)
router.post('/:id/helpful', requireAuth, markReviewHelpful);

// Moderation queue for Operations and Admin
router.get('/moderation', requireAuth, requireRole(ROLES.OPERATIONS, ROLES.ADMIN), getAllReviewsForModeration);
router.patch('/:id/moderate', requireAuth, requireRole(ROLES.OPERATIONS, ROLES.ADMIN), moderateReview);

export default router;
