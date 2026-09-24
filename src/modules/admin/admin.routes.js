import { Router } from 'express';
import {
  getActivityLogs,
  getAdminAnalytics,
  getUsers,
  toggleUserStatus,
  getStaff,
  createStaff,
  toggleStaffStatus,
  getPaymentsList,
  getReturnsAndCancellations,
} from './admin.controller.js';
import {
  requireAuth,
  requireRole,
  requirePermission,
  requireAnyPermission,
} from '../../middlewares/auth.middleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

// Activity logs with role-scoped security (accessible to all authenticated staff & admins)
router.get('/activity-logs', requireAuth, getActivityLogs);

// Analytics overview (accessible to all authenticated management staff)
router.get('/analytics', requireAuth, getAdminAnalytics);

// Finance & Processed Payments
router.get('/payments', requireAuth, requireAnyPermission(['payments.view', 'finance.reports']), getPaymentsList);
router.get('/returns-cancellations', requireAuth, requireAnyPermission(['returns.process', 'refunds.process', 'orders.view']), getReturnsAndCancellations);

// Customer Directory
router.get(
  '/users',
  requireAuth,
  requireAnyPermission(['customers.view', 'orders.view', 'support.view']),
  getUsers
);
router.patch(
  '/users/:id/toggle-status',
  requireAuth,
  requireRole(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  toggleUserStatus
);

// Staff Management (Strictly Super-Admin / Admin)
router.get('/staff', requireAuth, requireRole(ROLES.ADMIN, ROLES.SUPER_ADMIN), getStaff);
router.post('/staff', requireAuth, requireRole(ROLES.ADMIN, ROLES.SUPER_ADMIN), createStaff);
router.patch(
  '/staff/:id/toggle-status',
  requireAuth,
  requireRole(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  toggleStaffStatus
);

export default router;
