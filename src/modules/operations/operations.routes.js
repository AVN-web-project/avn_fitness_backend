import { Router } from 'express';
import {
  confirmDelivery,
  getOperationsDashboard,
  getOperationsOrders,
  recordRefund,
  reviewReturnRequest,
  updateOrderStatus,
  updateShippingAndDispatch,
} from './operations.controller.js';
import { requireAuth, requireRole } from '../../middlewares/auth.middleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

// Protect all operations endpoints for Operations and Admin
router.use(requireAuth, requireRole(ROLES.OPERATIONS, ROLES.ADMIN));

router.get('/dashboard', getOperationsDashboard);
router.get('/orders', getOperationsOrders);
router.patch('/orders/:id/status', updateOrderStatus);
router.patch('/orders/:id/dispatch', updateShippingAndDispatch);
router.patch('/orders/:id/deliver', confirmDelivery);
router.post('/orders/:id/returns/review', reviewReturnRequest);
router.post('/orders/:id/refund', recordRefund);

export default router;
