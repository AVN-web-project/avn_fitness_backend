import mongoose from 'mongoose';
import { ACTIVITY_ACTIONS, ENTITY_TYPES, ROLES, LOG_DOMAINS } from '../config/constants.js';
import { STAFF_ROLES } from './staff.model.js';

const ALL_STAFF_ROLES = Array.from(
  new Set([
    ...Object.values(ROLES),
    ...(STAFF_ROLES ? Object.values(STAFF_ROLES) : []),
    'super_admin',
    'product_inventory_manager',
    'order_manager',
    'customer_support',
    'customer_support_executive',
    'marketing_manager',
    'finance_manager',
    'admin',
    'operations',
  ])
);

const activityLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    userName: {
      type: String,
      required: true,
      trim: true,
    },
    userRole: {
      type: String,
      enum: ALL_STAFF_ROLES,
      required: true,
      index: true,
    },
    domain: {
      type: String,
      enum: Object.values(LOG_DOMAINS),
      default: LOG_DOMAINS.PRODUCTS,
      index: true,
    },
    action: {
      type: String,
      enum: Object.values(ACTIVITY_ACTIONS),
      required: true,
      index: true,
    },
    targetEntity: {
      type: String,
      enum: Object.values(ENTITY_TYPES),
      required: true,
      index: true,
    },
    targetEntityId: {
      type: String,
      default: null,
      index: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Immutable audit log
  }
);

activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ domain: 1, createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });

export const ActivityLog = mongoose.model('ActivityLog', activityLogSchema, 'staffActivityLogs_m');
export default ActivityLog;
