import { Router } from 'express';
import {
  checkServiceability,
  deactivateDescendants,
  listLocations,
  listRules,
  listServiceableCities,
  upsertRule,
  deleteRule,
} from './serviceability.controller.js';
import { requireAuth, requireAnyPermission } from '../../middlewares/auth.middleware.js';

const router = Router();

/**
 * Public: the storefront calls this from the address form and the product page.
 * No auth — a visitor must be able to check a pincode before signing up. Registered BEFORE
 * router.use(requireAuth) below.
 */
router.get('/check', checkServiceability);

// Everything past this point is staff-only.
router.use(requireAuth);

// Cascading picker: states → districts → pincodes, read from the master.
router.get('/locations', requireAnyPermission(['serviceability.view']), listLocations);

// The rules table. Most-specific-first, same order as resolution.
router.get('/rules', requireAnyPermission(['serviceability.view']), listRules);

// Feeds the admin's "activate a whole city" picker with real counts from the master.
router.get('/cities', requireAnyPermission(['serviceability.view']), listServiceableCities);

// Creating a rule decides what customers can and cannot order — order-management level, not view.
router.post('/rules', requireAnyPermission(['serviceability.edit']), upsertRule);
// Registered before /rules/:id so the literal path is not swallowed by the param route.
router.post(
  '/rules/deactivate-descendants',
  requireAnyPermission(['serviceability.edit']),
  deactivateDescendants
);
router.delete('/rules/:id', requireAnyPermission(['serviceability.edit']), deleteRule);

export default router;
