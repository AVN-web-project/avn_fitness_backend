import { Router } from 'express';
import { authenticateAdmin, requireAnyPermission } from '../../middlewares/auth.middleware.js';
import * as inventoryController from './inventory.controller.js';

const router = Router();

// Require admin authentication for all inventory endpoints
router.use(authenticateAdmin);

// View inventory
router.get(
  '/',
  requireAnyPermission(['inventory.view', 'products.view']),
  inventoryController.getInventory
);

// Adjust inventory levels
router.post(
  '/adjust',
  requireAnyPermission(['inventory.adjust', 'inventory.update']),
  inventoryController.adjustStock
);

router.patch(
  '/:sku',
  requireAnyPermission(['inventory.adjust', 'inventory.update']),
  inventoryController.adjustStock
);

router.patch(
  '/',
  requireAnyPermission(['inventory.adjust', 'inventory.update']),
  inventoryController.adjustStock
);

export default router;
