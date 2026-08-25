import { SupportRequest } from '../../models/support.model.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/apiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { recordActivityLog } from '../../middlewares/activityLogger.middleware.js';
import { ACTIVITY_ACTIONS, ENTITY_TYPES, SUPPORT_STATUS } from '../../config/constants.js';

const generateTicketNumber = () => {
  return `TCK-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
};

export const createTicket = asyncHandler(async (req, res) => {
  const { subject, category, message, orderId, priority } = req.body;

  const ticketNumber = generateTicketNumber();

  const ticket = await SupportRequest.create({
    ticketNumber,
    user: req.user._id,
    order: orderId || null,
    subject,
    category: category || 'general',
    initialMessage: message,
    priority: priority || 'medium',
    status: SUPPORT_STATUS.OPEN,
    replies: [
      {
        sender: req.user._id,
        senderRole: req.user.role,
        message,
      },
    ],
  });

  return ApiResponse.success(res, { ticket }, 'Support inquiry submitted successfully', 201);
});

export const getMyTickets = asyncHandler(async (req, res) => {
  const tickets = await SupportRequest.find({ user: req.user._id })
    .populate('order', 'orderNumber orderStatus')
    .sort({ updatedAt: -1 });

  return ApiResponse.success(res, { tickets }, 'Support inquiries retrieved');
});

export const getTicketDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const ticket = await SupportRequest.findById(id)
    .populate('user', 'name email phone')
    .populate('order', 'orderNumber orderStatus pricing items shipmentInfo')
    .populate('assignedTo', 'name email')
    .populate('replies.sender', 'name role');

  if (!ticket) throw ApiError.notFound('Support inquiry not found');

  if (
    ticket.user._id.toString() !== req.user._id.toString() &&
    req.user.role !== 'admin' &&
    req.user.role !== 'operations'
  ) {
    throw ApiError.forbidden('Unauthorized access to this support ticket.');
  }

  return ApiResponse.success(res, { ticket }, 'Support inquiry details retrieved');
});

export const replyToTicket = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { message } = req.body;

  if (!message) throw ApiError.badRequest('Message content is required.');

  const ticket = await SupportRequest.findById(id);
  if (!ticket) throw ApiError.notFound('Support inquiry not found');

  ticket.replies.push({
    sender: req.user._id,
    senderRole: req.user.role,
    message,
    createdAt: new Date(),
  });

  // If staff replied, set status to in_progress if open
  if ((req.user.role === 'admin' || req.user.role === 'operations') && ticket.status === SUPPORT_STATUS.OPEN) {
    ticket.status = SUPPORT_STATUS.IN_PROGRESS;
  }

  await ticket.save();

  if (req.user.role === 'admin' || req.user.role === 'operations') {
    await recordActivityLog({
      user: req.user,
      action: ACTIVITY_ACTIONS.SUPPORT_REPLIED,
      targetEntity: ENTITY_TYPES.SUPPORT_REQUEST,
      targetEntityId: ticket._id,
      details: { ticketNumber: ticket.ticketNumber },
      ipAddress: req.ip,
    });
  }

  return ApiResponse.success(res, { ticket }, 'Reply posted successfully');
});

export const getOperationsTickets = asyncHandler(async (req, res) => {
  const { status, category, priority, page = 1, limit = 20 } = req.query;
  const filter = {};

  if (status) filter.status = status;
  if (category) filter.category = category;
  if (priority) filter.priority = priority;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const [tickets, total] = await Promise.all([
    SupportRequest.find(filter)
      .populate('user', 'name email')
      .populate('order', 'orderNumber orderStatus')
      .populate('assignedTo', 'name')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limitNum),
    SupportRequest.countDocuments(filter),
  ]);

  return ApiResponse.success(
    res,
    {
      tickets,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    },
    'Support queue fetched'
  );
});

export const updateTicketStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, assignedTo } = req.body;

  const ticket = await SupportRequest.findById(id);
  if (!ticket) throw ApiError.notFound('Ticket not found');

  if (status) {
    if (!Object.values(SUPPORT_STATUS).includes(status)) {
      throw ApiError.badRequest(`Invalid ticket status '${status}'.`);
    }
    ticket.status = status;
    if (status === SUPPORT_STATUS.RESOLVED || status === SUPPORT_STATUS.CLOSED) {
      ticket.resolvedAt = new Date();
    }
  }

  if (assignedTo) {
    ticket.assignedTo = assignedTo;
  }

  await ticket.save();

  await recordActivityLog({
    user: req.user,
    action: ACTIVITY_ACTIONS.SUPPORT_REQUEST_UPDATED,
    targetEntity: ENTITY_TYPES.SUPPORT_REQUEST,
    targetEntityId: ticket._id,
    details: { ticketNumber: ticket.ticketNumber, status, assignedTo },
    ipAddress: req.ip,
  });

  return ApiResponse.success(res, { ticket }, 'Support ticket updated');
});
