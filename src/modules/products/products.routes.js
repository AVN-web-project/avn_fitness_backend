import { Router } from 'express';
import {
  createProduct,
  getProductBySlug,
  getProducts,
  updateInventory,
  updateProduct,
  updateProductStatus,
  uploadProductImage,
} from './products.controller.js';
import { optionalAuth, requireAuth, requireAnyPermission } from '../../middlewares/auth.middleware.js';

const router = Router();

// Public catalog routes (optionalAuth allows management staff to see all items)
router.get('/', optionalAuth, getProducts);
router.get('/:slug', optionalAuth, getProductBySlug);

// Image upload endpoint for products
router.post('/upload-image', requireAuth, requireAnyPermission(['products.create', 'products.edit']), uploadProductImage);

// Product governance (Admin, Super Admin, Product & Inventory Manager)
router.post(
  '/',
  requireAuth,
  requireAnyPermission(['products.create', 'products.edit']),
  createProduct
);

router.patch(
  '/:id',
  requireAuth,
  requireAnyPermission(['products.edit']),
  updateProduct
);

router.patch(
  '/:id/status',
  requireAuth,
  requireAnyPermission(['products.edit', 'products.view']),
  updateProductStatus
);

// Inventory update accessible by Operations, Inventory Manager, and Admin
router.patch(
  '/:id/inventory',
  requireAuth,
  requireAnyPermission(['inventory.update', 'inventory.adjust']),
  updateInventory
);

export default router;
