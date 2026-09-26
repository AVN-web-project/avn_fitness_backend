import { Router } from 'express';
import {
  createTicket,
  getMyTickets,
  getOperationsTickets,
  getTicketDetails,
  replyToTicket,
  updateTicketStatus,
} from './support.controller.js';
import { requireAuth, requireRole } from '../../middlewares/auth.middleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(requireAuth);

// Customer endpoints
router.post('/', createTicket);
router.get('/my-tickets', getMyTickets);
router.get('/:id', getTicketDetails);
router.post('/:id/reply', replyToTicket);

// Support queue
router.get('/operations/queue', requireRole(ROLES.SUPER_ADMIN, ROLES.CUSTOMER_SUPPORT), getOperationsTickets);
router.patch('/operations/:id/status', requireRole(ROLES.SUPER_ADMIN, ROLES.CUSTOMER_SUPPORT), updateTicketStatus);

export default router;
