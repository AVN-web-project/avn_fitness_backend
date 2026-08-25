import { Router } from 'express';
import {
  createProduct,
  getProductBySlug,
  getProducts,
  updateInventory,
  updateProduct,
  updateProductStatus,
} from './products.controller.js';
import { optionalAuth, requireAuth, requireRole } from '../../middlewares/auth.middleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

// Public catalog routes (optionalAuth to allow admins/ops to preview inactive items)
router.get('/', optionalAuth, getProducts);
router.get('/:slug', optionalAuth, getProductBySlug);

// Admin product governance
router.post('/', requireAuth, requireRole(ROLES.ADMIN), createProduct);
router.patch('/:id', requireAuth, requireRole(ROLES.ADMIN), updateProduct);
router.patch('/:id/status', requireAuth, requireRole(ROLES.ADMIN), updateProductStatus);

// Inventory update accessible by Operations and Admin
router.patch('/:id/inventory', requireAuth, requireRole(ROLES.OPERATIONS, ROLES.ADMIN), updateInventory);

export default router;
