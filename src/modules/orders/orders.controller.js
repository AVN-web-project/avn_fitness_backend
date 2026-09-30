import { Order } from '../../models/order.model.js';
import { Product } from '../../models/product.model.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/apiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ORDER_STATUS, ROLES } from '../../config/constants.js';

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
    req.user.role !== ROLES.SUPER_ADMIN
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
  const { reason, refundAccountDetails } = req.body;

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

  const isCod = (order.paymentInfo?.provider || '').toLowerCase() === 'cod';
  let normalizedRefundAccountDetails;
  if (isCod) {
    const method = typeof refundAccountDetails?.method === 'string'
      ? refundAccountDetails.method.trim().toLowerCase()
      : '';

    if (!['upi', 'bank'].includes(method)) {
      throw ApiError.badRequest('Choose UPI or bank transfer for your COD refund.');
    }

    if (method === 'upi') {
      const upiId = typeof refundAccountDetails?.upiId === 'string'
        ? refundAccountDetails.upiId.trim().toLowerCase()
        : '';
      if (upiId.length > 100 || !/^[a-z0-9][a-z0-9._-]{1,}@[a-z0-9][a-z0-9.-]{1,}[a-z0-9]$/.test(upiId)) {
        throw ApiError.badRequest('Please provide a valid UPI ID.');
      }
      normalizedRefundAccountDetails = { method, upiId };
    } else {
      const accountHolderName = typeof refundAccountDetails?.accountHolderName === 'string'
        ? refundAccountDetails.accountHolderName.trim()
        : '';
      const accountNumber = typeof refundAccountDetails?.accountNumber === 'string'
        ? refundAccountDetails.accountNumber.trim()
        : '';
      const ifscCode = typeof refundAccountDetails?.ifscCode === 'string'
        ? refundAccountDetails.ifscCode.trim().toUpperCase()
        : '';
      const validAccountHolderName = /^[\p{L}\p{M}]+(?:[ .'-][\p{L}\p{M}]+)*$/u.test(accountHolderName);

      if (accountHolderName.length < 2 || accountHolderName.length > 100 || !validAccountHolderName) {
        throw ApiError.badRequest('Please provide a valid account holder name.');
      }
      if (!/^\d{6,34}$/.test(accountNumber)) {
        throw ApiError.badRequest('Please provide a valid bank account number.');
      }
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode)) {
        throw ApiError.badRequest('Please provide a valid IFSC code.');
      }

      normalizedRefundAccountDetails = { method, accountHolderName, accountNumber, ifscCode };
    }
  }

  order.orderStatus = ORDER_STATUS.RETURN_REQUESTED;

  if (isCod) {
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
    refundAmount: Math.max(0, Number(order.pricing.totalPayable) - Number(order.pricing.codSurcharge || 0)),
    refundAccountDetails: normalizedRefundAccountDetails,
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