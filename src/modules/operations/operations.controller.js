import { Order } from '../../models/order.model.js';
import { Shipment } from '../../models/shipment.model.js';
import { Payment } from '../../models/payment.model.js';
import { Product } from '../../models/product.model.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/apiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validateOrderTransition } from '../../utils/orderStateMachine.js';
import { recordActivityLog } from '../../middlewares/activityLogger.middleware.js';
import {
  ACTIVITY_ACTIONS,
  ENTITY_TYPES,
  ORDER_STATUS,
  PAYMENT_STATUS,
  ROLES,
  SHIPMENT_STATUS,
} from '../../config/constants.js';

export const getOperationsOrders = asyncHandler(async (req, res) => {
  const { status, search, page = 1, limit = 20 } = req.query;
  const filter = {};

  if (status) {
    filter.orderStatus = status;
  }

  if (search) {
    filter.$or = [
      { orderNumber: { $regex: search, $options: 'i' } },
      { 'shippingAddress.fullName': { $regex: search, $options: 'i' } },
      { 'shippingAddress.phone': { $regex: search, $options: 'i' } },
      { 'shippingAddress.pincode': { $regex: search, $options: 'i' } },
    ];
  }

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Order.countDocuments(filter),
  ]);

  return ApiResponse.success(
    res,
    {
      orders,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    },
    'Operations order queue fetched successfully'
  );
});

export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, note } = req.body;

  const order = await Order.findById(id);
  if (!order) throw ApiError.notFound('Order not found');

  if (status === ORDER_STATUS.REFUNDED && !['super_admin', 'finance_manager'].includes(req.user.role)) {
    throw ApiError.forbidden('Only the Finance & Payouts Lead can process refunds.');
  }

  const isSuperAdmin = req.user.role === ROLES.SUPER_ADMIN;
  validateOrderTransition(order.orderStatus, status, isSuperAdmin);

  const previousStatus = order.orderStatus;
  order.orderStatus = status;
  order.statusHistory.push({
    status,
    changedBy: req.user._id,
    changedByRole: req.user.role,
    note: note || `Status updated from ${previousStatus} to ${status} by ${req.user.name}`,
  });

  await order.save();

  await recordActivityLog({
    user: req.user,
    action: ACTIVITY_ACTIONS.ORDER_STATUS_CHANGED,
    targetEntity: ENTITY_TYPES.ORDER,
    targetEntityId: order._id,
    details: { orderNumber: order.orderNumber, from: previousStatus, to: status, note },
    ipAddress: req.ip,
  });

  return ApiResponse.success(res, { order }, `Order status updated to '${status}'`);
});

export const updateShippingAndDispatch = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { carrier, trackingNumber, estimatedDeliveryDate, notes } = req.body;

  if (!carrier || !trackingNumber) {
    throw ApiError.badRequest('Carrier name and tracking number are required for dispatch.');
  }

  const order = await Order.findById(id);
  if (!order) throw ApiError.notFound('Order not found');

  const previousStatus = order.orderStatus;
  order.orderStatus = ORDER_STATUS.SHIPPED;
  order.shipmentInfo = {
    carrier,
    trackingNumber,
    dispatchedAt: new Date(),
    estimatedDeliveryDate: estimatedDeliveryDate ? new Date(estimatedDeliveryDate) : null,
  };

  order.statusHistory.push({
    status: ORDER_STATUS.SHIPPED,
    changedBy: req.user._id,
    changedByRole: req.user.role,
    note: `Dispatched via ${carrier} (Tracking: ${trackingNumber})`,
  });

  await order.save();

  // Create or update Shipment record
  await Shipment.findOneAndUpdate(
    { order: order._id },
    {
      order: order._id,
      carrier,
      trackingNumber,
      status: SHIPMENT_STATUS.SHIPPED,
      dispatchedAt: new Date(),
      estimatedDeliveryDate: estimatedDeliveryDate ? new Date(estimatedDeliveryDate) : null,
      notes: notes || '',
      $push: {
        trackingHistory: {
          status: 'SHIPPED',
          description: `Dispatched via ${carrier} with Tracking #${trackingNumber}`,
          timestamp: new Date(),
        },
      },
    },
    { upsert: true, new: true }
  );

  await recordActivityLog({
    user: req.user,
    action: ACTIVITY_ACTIONS.ORDER_SHIPPED,
    targetEntity: ENTITY_TYPES.ORDER,
    targetEntityId: order._id,
    details: { orderNumber: order.orderNumber, carrier, trackingNumber },
    ipAddress: req.ip,
  });

  return ApiResponse.success(res, { order }, 'Order marked as Shipped and tracking recorded');
});

export const confirmDelivery = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const order = await Order.findById(id);
  if (!order) throw ApiError.notFound('Order not found');

  order.orderStatus = ORDER_STATUS.DELIVERED;
  order.shipmentInfo.deliveredAt = new Date();

  order.statusHistory.push({
    status: ORDER_STATUS.DELIVERED,
    changedBy: req.user._id,
    changedByRole: req.user.role,
    note: 'Delivery confirmed.',
  });

  await order.save();

  await Shipment.updateOne(
    { order: order._id },
    {
      status: SHIPMENT_STATUS.DELIVERED,
      deliveredAt: new Date(),
      $push: {
        trackingHistory: {
          status: 'DELIVERED',
          description: 'Package delivered to customer.',
          timestamp: new Date(),
        },
      },
    }
  );

  await recordActivityLog({
    user: req.user,
    action: ACTIVITY_ACTIONS.ORDER_DELIVERED,
    targetEntity: ENTITY_TYPES.ORDER,
    targetEntityId: order._id,
    details: { orderNumber: order.orderNumber },
    ipAddress: req.ip,
  });

  return ApiResponse.success(res, { order }, 'Order marked as Delivered');
});

export const reviewReturnRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action, notes, refundAmount } = req.body; // action: 'approve' | 'reject'

  const order = await Order.findById(id);
  if (!order) throw ApiError.notFound('Order not found');

  if (order.orderStatus !== ORDER_STATUS.RETURN_REQUESTED) {
    throw ApiError.badRequest('Order is not in return_requested state.');
  }

  if (action === 'approve') {
    order.orderStatus = ORDER_STATUS.RETURNED;
    order.returnRequest.status = 'approved';
    order.returnRequest.reviewedBy = req.user._id;
    order.returnRequest.reviewedAt = new Date();
    order.returnRequest.reviewNotes = notes || '';
    // Never approve a refund above what the customer actually paid
    const paidAmount = Number(order.pricing?.totalPayable) || 0;
    let approvedRefundAmount = Number(refundAmount) || paidAmount;
    if (!Number.isFinite(approvedRefundAmount) || approvedRefundAmount <= 0) {
      approvedRefundAmount = paidAmount;
    }
    if (paidAmount > 0 && approvedRefundAmount > paidAmount) {
      approvedRefundAmount = paidAmount;
    }
    order.returnRequest.refundAmount = approvedRefundAmount;

    order.statusHistory.push({
      status: ORDER_STATUS.RETURNED,
      changedBy: req.user._id,
      changedByRole: req.user.role,
      note: `Return request approved. Returned items inspected. Note: ${notes || ''}`,
    });

    await recordActivityLog({
      user: req.user,
      action: ACTIVITY_ACTIONS.RETURN_APPROVED,
      targetEntity: ENTITY_TYPES.ORDER,
      targetEntityId: order._id,
      details: { orderNumber: order.orderNumber, notes, refundAmount: order.returnRequest.refundAmount },
      ipAddress: req.ip,
    });
  } else if (action === 'reject') {
    order.orderStatus = ORDER_STATUS.DELIVERED;
    order.returnRequest.isRequested = false;
    order.returnRequest.status = 'rejected';
    order.returnRequest.reviewedBy = req.user._id;
    order.returnRequest.reviewedAt = new Date();
    order.returnRequest.reviewNotes = notes || '';

    order.statusHistory.push({
      status: ORDER_STATUS.DELIVERED,
      changedBy: req.user._id,
      changedByRole: req.user.role,
      note: `Return request rejected. Reason: ${notes || 'Condition criteria not met'}`,
    });

    await recordActivityLog({
      user: req.user,
      action: ACTIVITY_ACTIONS.RETURN_REJECTED,
      targetEntity: ENTITY_TYPES.ORDER,
      targetEntityId: order._id,
      details: { orderNumber: order.orderNumber, reason: notes },
      ipAddress: req.ip,
    });
  } else {
    throw ApiError.badRequest("Action must be either 'approve' or 'reject'.");
  }

  await order.save();

  return ApiResponse.success(res, { order }, `Return request ${action}d successfully`);
});

export const recordRefund = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { refundTransactionId, refundAmount, reason } = req.body;

  const order = await Order.findById(id);
  if (!order) throw ApiError.notFound('Order not found');

  const validRefundStates = [ORDER_STATUS.RETURNED, ORDER_STATUS.CANCELLED];
  if (!validRefundStates.includes(order.orderStatus)) {
    throw ApiError.badRequest(`Refund can only be recorded for Returned or Cancelled orders.`);
  }

  if (
    order.orderStatus === ORDER_STATUS.CANCELLED &&
    (order.paymentInfo?.paymentStatus !== PAYMENT_STATUS.CAPTURED || order.paymentInfo?.provider === 'cod')
  ) {
    throw ApiError.badRequest('Cancelled orders are eligible for refund only after a captured online payment.');
  }

  const paidAmount = Number(order.pricing?.totalPayable) || 0;
  let finalRefundAmount = Number(refundAmount);
  if (!Number.isFinite(finalRefundAmount) || finalRefundAmount <= 0) {
    finalRefundAmount = Number(order.returnRequest?.refundAmount) || paidAmount;
  }
  // Never refund more than the customer actually paid
  if (finalRefundAmount > paidAmount) {
    finalRefundAmount = paidAmount;
  }
  const finalRefundRef = refundTransactionId || `ref_${Date.now()}`;

  order.orderStatus = ORDER_STATUS.REFUNDED;
  order.paymentInfo.paymentStatus = PAYMENT_STATUS.REFUNDED;
  order.paymentInfo.refundTransactionId = finalRefundRef;
  order.returnRequest.status = 'completed';
  // Keep the Finance page / returns list in sync with the amount actually refunded
  if (order.returnRequest) {
    order.returnRequest.refundAmount = finalRefundAmount;
  }

  order.statusHistory.push({
    status: ORDER_STATUS.REFUNDED,
    changedBy: req.user._id,
    changedByRole: req.user.role,
    note: `Refund of ₹${finalRefundAmount} recorded (Ref: ${finalRefundRef}). Reason: ${reason || ''}`,
  });

  await order.save();

  // Update Payment record
  await Payment.findOneAndUpdate(
    { order: order._id },
    {
      status: PAYMENT_STATUS.REFUNDED,
      refundInfo: {
        refundId: finalRefundRef,
        amount: finalRefundAmount,
        refundedAt: new Date(),
        reason: reason || 'Order return/cancellation refund',
      },
    }
  );

  await recordActivityLog({
    user: req.user,
    action: ACTIVITY_ACTIONS.REFUND_RECORDED,
    targetEntity: ENTITY_TYPES.ORDER,
    targetEntityId: order._id,
    details: {
      orderNumber: order.orderNumber,
      // Txn ID of the refunded order (same value the Finance page shows)
      paymentTransactionId:
        order.paymentInfo?.transactionId ||
        order.paymentInfo?.paymentOrderId ||
        `AVN-TXN-${order.orderNumber}`,
      refundAmount: finalRefundAmount,
      reason,
    },
    ipAddress: req.ip,
  });

  return ApiResponse.success(res, { order }, `Refund of ₹${finalRefundAmount} recorded successfully`);
});

export const getOperationsDashboard = asyncHandler(async (req, res) => {
  const [
    pendingDispatchCount,
    shippedCount,
    returnRequestedCount,
    lowStockProducts,
  ] = await Promise.all([
    Order.countDocuments({ orderStatus: { $in: [ORDER_STATUS.PAID_CONFIRMED, ORDER_STATUS.PROCESSING] } }),
    Order.countDocuments({ orderStatus: ORDER_STATUS.SHIPPED }),
    Order.countDocuments({ orderStatus: ORDER_STATUS.RETURN_REQUESTED }),
    Product.find({ 'variants.stockQuantity': { $lte: 5 } }).select('name slug variants status'),
  ]);

  return ApiResponse.success(
    res,
    {
      pipeline: {
        pendingDispatchCount,
        shippedCount,
        returnRequestedCount,
      },
      lowStockAlerts: lowStockProducts,
    },
    'Operations dashboard metrics retrieved'
  );
});