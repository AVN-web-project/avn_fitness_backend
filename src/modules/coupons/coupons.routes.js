import { Router } from 'express';
import {
  createCoupon,
  getActiveCoupons,
  getAllCoupons,
  toggleCouponStatus,
  updateCoupon,
} from './coupons.controller.js';
import { requireAuth, requireRole } from '../../middlewares/auth.middleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

// Public active coupon lookup (for cart display)
router.get('/active', getActiveCoupons);

// Admin coupon management
router.get('/', requireAuth, requireRole(ROLES.ADMIN), getAllCoupons);
router.post('/', requireAuth, requireRole(ROLES.ADMIN), createCoupon);
router.patch('/:id', requireAuth, requireRole(ROLES.ADMIN), updateCoupon);
router.patch('/:id/toggle-status', requireAuth, requireRole(ROLES.ADMIN), toggleCouponStatus);

export default router;
