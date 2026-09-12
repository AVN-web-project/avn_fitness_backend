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
import { requireAuth, requireAnyPermission } from '../../middlewares/auth.middleware.js';

const router = Router();

router.use(requireAuth);

// Dashboard view accessible to all operations & management staff
router.get('/dashboard', getOperationsDashboard);

// Order fulfillment & shipping
router.get('/orders', requireAnyPermission(['orders.view', 'shipments.view']), getOperationsOrders);
router.patch('/orders/:id/status', requireAnyPermission(['orders.update_status', 'orders.process']), updateOrderStatus);
router.patch('/orders/:id/dispatch', requireAnyPermission(['shipments.update']), updateShippingAndDispatch);
router.patch('/orders/:id/deliver', requireAnyPermission(['shipments.update', 'orders.process']), confirmDelivery);
router.post('/orders/:id/returns/review', requireAnyPermission(['returns.process']), reviewReturnRequest);
router.post('/orders/:id/refund', requireAnyPermission(['refunds.process']), recordRefund);

export default router;
