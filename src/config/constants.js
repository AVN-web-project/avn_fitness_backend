/**
 * Application Constants & Enums
 * Aligned with Commercial Fitness Gear E-Com Technical Implementation & MVP Specifications
 */

export const ROLES = Object.freeze({
  USER: 'user',
  OPERATIONS: 'operations',
  ADMIN: 'admin',
});

export const ALL_ROLES = Object.values(ROLES);

export const PRODUCT_STATUS = Object.freeze({
  ACTIVE: 'active',
  UNAVAILABLE: 'unavailable',
  DISCONTINUED: 'discontinued',
});

export const ALL_PRODUCT_STATUSES = Object.values(PRODUCT_STATUS);

export const AGE_GROUPS = Object.freeze({
  ADULTS: 'adults',
  KIDS: 'kids',
  ALL: 'all',
});

export const GENDERS = Object.freeze({
  MEN: 'men',
  WOMEN: 'women',
  UNISEX: 'unisex',
});

export const ORDER_STATUS = Object.freeze({
  PENDING_PAYMENT: 'pending_payment',
  PAID_CONFIRMED: 'paid_confirmed',
  PROCESSING: 'processing',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  RETURN_REQUESTED: 'return_requested',
  RETURNED: 'returned',
  REFUNDED: 'refunded',
  PAYMENT_FAILED: 'payment_failed',
});

export const ALL_ORDER_STATUSES = Object.values(ORDER_STATUS);

export const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  CAPTURED: 'captured',
  FAILED: 'failed',
  REFUNDED: 'refunded',
});

export const SHIPMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  LABEL_CREATED: 'label_created',
  SHIPPED: 'shipped',
  IN_TRANSIT: 'in_transit',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  RETURNED: 'returned',
  FAILED: 'failed',
});

export const REVIEW_STATUS = Object.freeze({
  PENDING: 'pending',
  PUBLISHED: 'published',
  HIDDEN: 'hidden',
});

export const SUPPORT_STATUS = Object.freeze({
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
});

export const SUPPORT_PRIORITY = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
});

export const DISCOUNT_TYPE = Object.freeze({
  PERCENTAGE: 'percentage',
  FIXED: 'fixed',
});

export const ACTIVITY_ACTIONS = Object.freeze({
  // Products
  PRODUCT_CREATED: 'PRODUCT_CREATED',
  PRODUCT_UPDATED: 'PRODUCT_UPDATED',
  PRODUCT_STATUS_CHANGED: 'PRODUCT_STATUS_CHANGED',
  INVENTORY_UPDATED: 'INVENTORY_UPDATED',

  // Orders
  ORDER_STATUS_CHANGED: 'ORDER_STATUS_CHANGED',
  ORDER_SHIPPED: 'ORDER_SHIPPED',
  ORDER_DELIVERED: 'ORDER_DELIVERED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',

  // Returns & Refunds
  RETURN_APPROVED: 'RETURN_APPROVED',
  RETURN_REJECTED: 'RETURN_REJECTED',
  REFUND_RECORDED: 'REFUND_RECORDED',

  // Coupons
  COUPON_CREATED: 'COUPON_CREATED',
  COUPON_UPDATED: 'COUPON_UPDATED',

  // Reviews
  REVIEW_MODERATED: 'REVIEW_MODERATED',

  // Support
  SUPPORT_REQUEST_UPDATED: 'SUPPORT_REQUEST_UPDATED',
  SUPPORT_REPLIED: 'SUPPORT_REPLIED',
});

export const ENTITY_TYPES = Object.freeze({
  USER: 'User',
  PRODUCT: 'Product',
  CATEGORY: 'Category',
  ORDER: 'Order',
  COUPON: 'Coupon',
  REVIEW: 'Review',
  SUPPORT_REQUEST: 'SupportRequest',
  ACTIVITY_LOG: 'ActivityLog',
});
