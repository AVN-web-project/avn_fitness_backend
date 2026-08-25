import { Router } from 'express';
import {
  addToCart,
  applyCoupon,
  getCart,
  removeCoupon,
  removeFromCart,
  updateCartItemQuantity,
} from './cart.controller.js';
import { optionalAuth } from '../../middlewares/auth.middleware.js';

const router = Router();

// All cart endpoints support optional authentication (guest ID header or auth token)
router.use(optionalAuth);

router.get('/', getCart);
router.post('/items', addToCart);
router.patch('/items/:itemId', updateCartItemQuantity);
router.delete('/items/:itemId', removeFromCart);
router.post('/apply-coupon', applyCoupon);
router.post('/remove-coupon', removeCoupon);

export default router;
