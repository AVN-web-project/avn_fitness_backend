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

// Moderation queue for super admin and support/marketing roles
router.get('/moderation', requireAuth, requireRole(ROLES.SUPER_ADMIN, ROLES.CUSTOMER_SUPPORT, ROLES.MARKETING_MANAGER), getAllReviewsForModeration);
router.patch('/:id/moderate', requireAuth, requireRole(ROLES.SUPER_ADMIN, ROLES.CUSTOMER_SUPPORT, ROLES.MARKETING_MANAGER), moderateReview);

export default router;
