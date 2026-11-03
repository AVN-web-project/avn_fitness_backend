import express from 'express';
import {
  getAnnouncementStrip,
  updateAnnouncementStrip,
} from './marketing.controller.js';

import { requireAuth, requirePermission } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.get('/announcement-strip', getAnnouncementStrip);

router.put(
  '/announcement-strip',
  requireAuth,
  requirePermission('marketing.announcement.edit'),
  updateAnnouncementStrip
);

export default router;