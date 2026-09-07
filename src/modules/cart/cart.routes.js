import { Router } from 'express';
import {
  addToCart,
  applyCoupon,
  clearCart,
  clearGuestCartOnExit,
  getCart,
  removeCoupon,
  removeFromCart,
  updateCartItemQuantity,
} from './cart.controller.js';
import { optionalAuth } from '../../middlewares/auth.middleware.js';

const router = Router();

// All cart endpoints support optional authentication (session-only for guests, persistent for users)
router.use(optionalAuth);

// Cart status and retrieval
router.get('/', getCart);

// Add to cart (both / and /items aliases supported)
router.post('/', addToCart);
router.post('/items', addToCart);

// Update quantity (both /:itemId and /items/:itemId aliases supported)
router.patch('/:itemId', updateCartItemQuantity);
router.patch('/items/:itemId', updateCartItemQuantity);

// Remove item (both /:itemId and /items/:itemId aliases supported)
router.delete('/:itemId', removeFromCart);
router.delete('/items/:itemId', removeFromCart);

// Clear entire cart
router.delete('/', clearCart);

// Guest exit cleanup (deletes guest cart from MongoDB when guest leaves site)
router.delete('/guest/:guestId', clearGuestCartOnExit);
router.post('/guest/exit', clearGuestCartOnExit);
router.all('/guest/:guestId', clearGuestCartOnExit);

// Coupons
router.post('/apply-coupon', applyCoupon);
router.post('/remove-coupon', removeCoupon);

export default router;
