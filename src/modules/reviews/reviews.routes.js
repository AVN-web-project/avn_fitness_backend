import { Router } from 'express';
import {
  createReview,
  getAllReviewsForModeration,
  getProductReviews,
  moderateReview,
} from './reviews.controller.js';
import { requireAuth, requireRole } from '../../middlewares/auth.middleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

// Public review listing for products
router.get('/products/:productId', getProductReviews);

// Customer review submission
router.post('/', requireAuth, createReview);

// Moderation queue for Operations and Admin
router.get('/moderation', requireAuth, requireRole(ROLES.OPERATIONS, ROLES.ADMIN), getAllReviewsForModeration);
router.patch('/:id/moderate', requireAuth, requireRole(ROLES.OPERATIONS, ROLES.ADMIN), moderateReview);

export default router;
