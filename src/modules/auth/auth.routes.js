import { Router } from 'express';
import {
  addAddress,
  deleteAddress,
  getProfile,
  login,
  logout,
  register,
  updateAddress,
  updateProfile,
} from './auth.controller.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { authLimiter } from '../../middlewares/rateLimiter.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { addressSchema, loginSchema, registerSchema } from './auth.validation.js';

const router = Router();

// Public auth endpoints with rate limiting
router.post('/register', authLimiter, validate(registerSchema), register);
router.post('/login', authLimiter, validate(loginSchema), login);
router.post('/logout', logout);

// Authenticated user endpoints
router.get('/profile', requireAuth, getProfile);
router.patch('/profile', requireAuth, updateProfile);

// Address management
router.post('/addresses', requireAuth, validate(addressSchema), addAddress);
router.patch('/addresses/:addressId', requireAuth, updateAddress);
router.delete('/addresses/:addressId', requireAuth, deleteAddress);

export default router;
