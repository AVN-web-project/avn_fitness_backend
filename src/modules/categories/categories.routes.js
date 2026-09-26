import { Router } from 'express';
import {
  createCategory,
  getAllCategories,
  getCategoryBySlug,
  updateCategory,
} from './categories.controller.js';
import { requireAuth, requireRole } from '../../middlewares/auth.middleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

// Public routes
router.get('/', getAllCategories);
router.get('/:slug', getCategoryBySlug);

// Super admin only routes
router.post('/', requireAuth, requireRole(ROLES.SUPER_ADMIN), createCategory);
router.patch('/:id', requireAuth, requireRole(ROLES.SUPER_ADMIN), updateCategory);

export default router;
