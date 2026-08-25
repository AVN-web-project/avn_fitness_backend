import { Router } from 'express';
import {
  getActivityLogs,
  getAdminAnalytics,
  getUsers,
  toggleUserStatus,
} from './admin.controller.js';
import { requireAuth, requireRole } from '../../middlewares/auth.middleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

// Strictly Admin-only routes
router.use(requireAuth, requireRole(ROLES.ADMIN));

router.get('/activity-logs', getActivityLogs);
router.get('/analytics', getAdminAnalytics);
router.get('/users', getUsers);
router.patch('/users/:id/toggle-status', toggleUserStatus);

export default router;
