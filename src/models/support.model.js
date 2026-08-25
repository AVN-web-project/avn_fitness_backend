import mongoose from 'mongoose';
import { SUPPORT_PRIORITY, SUPPORT_STATUS } from '../config/constants.js';

const replySchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    senderRole: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const supportSchema = new mongoose.Schema(
  {
    ticketNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    subject: {
      type: String,
      required: [true, 'Support subject is required'],
      trim: true,
      maxlength: [200, 'Subject cannot exceed 200 characters'],
    },
    category: {
      type: String,
      enum: ['order', 'product', 'payment', 'shipping', 'return_refund', 'general'],
      default: 'general',
    },
    status: {
      type: String,
      enum: Object.values(SUPPORT_STATUS),
      default: SUPPORT_STATUS.OPEN,
      index: true,
    },
    priority: {
      type: String,
      enum: Object.values(SUPPORT_PRIORITY),
      default: SUPPORT_PRIORITY.MEDIUM,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    initialMessage: {
      type: String,
      required: [true, 'Initial inquiry message is required'],
      trim: true,
    },
    replies: [replySchema],
    resolvedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

supportSchema.index({ user: 1, status: 1 });
supportSchema.index({ status: 1, createdAt: -1 });

export const SupportRequest = mongoose.model('SupportRequest', supportSchema);
