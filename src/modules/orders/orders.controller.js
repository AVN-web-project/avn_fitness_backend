import { Order } from '../../models/order.model.js';
import { Product } from '../../models/product.model.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/apiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ORDER_STATUS } from '../../config/constants.js';

export const getMyOrders = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;
  const filter = { user: req.user._id };

  if (status) {
    filter.orderStatus = status;
  }

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
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
    'Order history fetched successfully'
  );
});

export const getOrderDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const order = await Order.findOne({
    $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { orderNumber: id }],
  }).populate('items.product', 'name slug images');

  if (!order) {
    throw ApiError.notFound('Order not found');
  }

  // Ensure customer can only view their own order (unless staff)
  if (
    order.user.toString() !== req.user._id.toString() &&
    req.user.role !== 'admin' &&
    req.user.role !== 'operations'
  ) {
    throw ApiError.forbidden('Unauthorized access to this order');
  }

  return ApiResponse.success(res, { order }, 'Order details retrieved successfully');
});

export const requestOrderCancellation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
  if (!trimmedReason) {
    throw ApiError.badRequest('Please provide a reason for cancellation.');
  }

  const order = await Order.findOne({
    $or: [
      { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
      { orderNumber: id },
    ],
    user: req.user._id,
  });
  if (!order) {
    throw ApiError.notFound('Order not found');
  }

  // Cancellation allowed before Shipped
  const cancellableStates = [ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.PAID_CONFIRMED, ORDER_STATUS.PROCESSING];
  if (!cancellableStates.includes(order.orderStatus)) {
    throw ApiError.badRequest(
      `Cannot cancel order in '${order.orderStatus}' state. Orders can only be cancelled prior to dispatch.`
    );
  }

  order.orderStatus = ORDER_STATUS.CANCELLED;
  order.cancellation = {
    isCancelled: true,
    reason: trimmedReason,
    cancelledAt: new Date(),
    cancelledBy: req.user._id,
  };

  order.statusHistory.push({
    status: ORDER_STATUS.CANCELLED,
    changedBy: req.user._id,
    changedByRole: req.user.role,
    note: `Order cancelled by customer. Reason: ${trimmedReason}`,
  });

  // Restock inventory
  for (const item of order.items) {
    if (item.product) {
      await Product.updateOne(
        { _id: item.product, 'variants.sku': item.variantSku },
        { $inc: { 'variants.$.stockQuantity': item.quantity } }
      );
    }
  }

  await order.save();

  return ApiResponse.success(res, { order }, 'Order cancelled successfully');
});

export const requestOrderReturn = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
  if (!trimmedReason) {
    throw ApiError.badRequest('Please provide a reason for the return request.');
  }

  const order = await Order.findOne({
    $or: [
      { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
      { orderNumber: id },
    ],
    user: req.user._id,
  });
  if (!order) {
    throw ApiError.notFound('Order not found');
  }

  if (order.orderStatus !== ORDER_STATUS.DELIVERED) {
    throw ApiError.badRequest('Return requests are only permitted for delivered orders.');
  }

  order.orderStatus = ORDER_STATUS.RETURN_REQUESTED;

  // Since order was delivered, ensure COD payment status is marked captured
  if (order.paymentInfo && order.paymentInfo.provider === 'cod') {
    order.paymentInfo.paymentStatus = 'captured';
    if (!order.paymentInfo.paidAt) {
      order.paymentInfo.paidAt = new Date();
    }
  }

  order.returnRequest = {
    isRequested: true,
    reason: trimmedReason,
    requestedAt: new Date(),
    status: 'pending',
    refundAmount: order.pricing.totalPayable,
    reviewNotes: '',
  };

  order.statusHistory.push({
    status: ORDER_STATUS.RETURN_REQUESTED,
    changedBy: req.user._id,
    changedByRole: req.user.role,
    note: `Customer requested return. Reason: ${trimmedReason}`,
  });

  await order.save();

  return ApiResponse.success(res, { order }, 'Return request submitted successfully. Our operations team will review it.');
});


