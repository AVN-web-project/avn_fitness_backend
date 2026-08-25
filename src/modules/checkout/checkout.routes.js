import { Router } from 'express';
import { createCheckoutOrder, verifyPayment } from './checkout.controller.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';

const router = Router();

// Checkout endpoints strictly require authentication
router.post('/create-order', requireAuth, createCheckoutOrder);
router.post('/verify-payment', requireAuth, verifyPayment);

export default router;
