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

// Super admin coupon management
router.get('/', requireAuth, requireRole(ROLES.SUPER_ADMIN), getAllCoupons);
router.post('/', requireAuth, requireRole(ROLES.SUPER_ADMIN), createCoupon);
router.patch('/:id', requireAuth, requireRole(ROLES.SUPER_ADMIN), updateCoupon);
router.patch('/:id/toggle-status', requireAuth, requireRole(ROLES.SUPER_ADMIN), toggleCouponStatus);

export default router;
