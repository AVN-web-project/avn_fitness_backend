import mongoose from 'mongoose';
import { ALL_ORDER_STATUSES, ORDER_STATUS, PAYMENT_STATUS } from '../config/constants.js';

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    variantSku: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    variantTitle: {
      type: String,
      required: true,
    },
    image: {
      type: String,
    },
    price: {
      type: Number,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    subtotal: {
      type: Number,
      required: true,
    },
  },
  { _id: true }
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ALL_ORDER_STATUSES,
      required: true,
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    changedByRole: {
      type: String,
      default: 'system',
    },
    note: {
      type: String,
      default: '',
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Order must belong to an authenticated user.'],
      index: true,
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: [(v) => Array.isArray(v) && v.length > 0, 'Order must have at least one item.'],
    },
    pricing: {
      subtotal: { type: Number, required: true },
      discount: { type: Number, default: 0 },
      shippingFee: { type: Number, default: 0 },
      tax: { type: Number, default: 0 },
      totalPayable: { type: Number, required: true },
    },
    shippingAddress: {
      fullName: { type: String, required: true },
      phone: { type: String, required: true },
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, required: true },
      country: { type: String, default: 'India' },
    },
    paymentInfo: {
      provider: { type: String, default: 'razorpay' },
      paymentOrderId: { type: String },
      transactionId: { type: String },
      paymentStatus: {
        type: String,
        enum: Object.values(PAYMENT_STATUS),
        default: PAYMENT_STATUS.PENDING,
      },
      paidAt: { type: Date },
    },
    shipmentInfo: {
      carrier: { type: String, default: '' },
      trackingNumber: { type: String, default: '' },
      dispatchedAt: { type: Date },
      deliveredAt: { type: Date },
      estimatedDeliveryDate: { type: Date },
    },
    orderStatus: {
      type: String,
      enum: ALL_ORDER_STATUSES,
      default: ORDER_STATUS.PENDING_PAYMENT,
      index: true,
    },
    statusHistory: [statusHistorySchema],
    cancellation: {
      isCancelled: { type: Boolean, default: false },
      reason: { type: String, default: '' },
      cancelledAt: { type: Date },
      cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    returnRequest: {
      isRequested: { type: Boolean, default: false },
      reason: { type: String, default: '' },
      requestedAt: { type: Date },
      status: {
        type: String,
        enum: ['none', 'pending', 'approved', 'rejected', 'completed'],
        default: 'none',
      },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      reviewedAt: { type: Date },
      refundAmount: { type: Number, default: 0 },
      reviewNotes: { type: String, default: '' },
    },
    appliedCoupon: {
      code: { type: String },
      discountAmount: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for operations and customer queries
orderSchema.index({ createdAt: -1, orderStatus: 1 });
orderSchema.index({ user: 1, createdAt: -1 });

export const Order = mongoose.model('Order', orderSchema);
