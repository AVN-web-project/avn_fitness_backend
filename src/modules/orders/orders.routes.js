import { Router } from 'express';
import {
  getMyOrders,
  getOrderDetails,
  requestOrderCancellation,
  requestOrderReturn,
} from './orders.controller.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';

const router = Router();

router.use(requireAuth);

router.get('/', getMyOrders);
router.get('/:id', getOrderDetails);
router.post('/:id/cancel', requestOrderCancellation);
router.post('/:id/return', requestOrderReturn);

export default router;
