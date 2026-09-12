/**
 * Application Constants & Enums
 * Aligned with Commercial Fitness Gear E-Com Technical Implementation & MVP Specifications
 */

export const ROLES = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  OPERATIONS: 'operations',
  PRODUCT_INVENTORY_MANAGER: 'product_inventory_manager',
  ORDER_MANAGER: 'order_manager',
  CUSTOMER_SUPPORT_EXECUTIVE: 'customer_support_executive',
  CUSTOMER_SUPPORT: 'customer_support',
  MARKETING_MANAGER: 'marketing_manager',
  FINANCE_MANAGER: 'finance_manager',
  USER: 'user',
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

export const LOG_DOMAINS = Object.freeze({
  PRODUCTS: 'PRODUCTS',
  INVENTORY: 'INVENTORY',
  CATEGORIES: 'CATEGORIES',
  ORDERS: 'ORDERS',
  SHIPMENTS: 'SHIPMENTS',
  RETURNS: 'RETURNS',
  REFUNDS: 'REFUNDS',
  CUSTOMER_SUPPORT: 'CUSTOMER_SUPPORT',
  MARKETING: 'MARKETING',
  COUPONS: 'COUPONS',
  REVIEWS: 'REVIEWS',
  FINANCE: 'FINANCE',
  PAYMENTS: 'PAYMENTS',
  STAFF: 'STAFF',
  SYSTEM: 'SYSTEM',
});

// Domain mappings allowed for non-super_admin activity log visibility
export const ROLE_LOG_DOMAINS = {
  [ROLES.SUPER_ADMIN]: null,
  [ROLES.ADMIN]: null,
  [ROLES.PRODUCT_INVENTORY_MANAGER]: [
    LOG_DOMAINS.PRODUCTS,
    LOG_DOMAINS.INVENTORY,
    LOG_DOMAINS.CATEGORIES,
  ],
  [ROLES.ORDER_MANAGER]: [
    LOG_DOMAINS.ORDERS,
    LOG_DOMAINS.SHIPMENTS,
    LOG_DOMAINS.RETURNS,
    LOG_DOMAINS.REFUNDS,
  ],
  [ROLES.CUSTOMER_SUPPORT_EXECUTIVE]: [LOG_DOMAINS.CUSTOMER_SUPPORT],
  [ROLES.CUSTOMER_SUPPORT]: [LOG_DOMAINS.CUSTOMER_SUPPORT],
  [ROLES.MARKETING_MANAGER]: [
    LOG_DOMAINS.MARKETING,
    LOG_DOMAINS.COUPONS,
    LOG_DOMAINS.REVIEWS,
  ],
  [ROLES.FINANCE_MANAGER]: [
    LOG_DOMAINS.FINANCE,
    LOG_DOMAINS.PAYMENTS,
    LOG_DOMAINS.REFUNDS,
  ],
  [ROLES.OPERATIONS]: [
    LOG_DOMAINS.ORDERS,
    LOG_DOMAINS.SHIPMENTS,
    LOG_DOMAINS.INVENTORY,
    LOG_DOMAINS.PRODUCTS,
  ],
};

// Fine-grained action-level permissions
export const ROLE_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: ['*'],
  [ROLES.ADMIN]: ['*'],
  [ROLES.PRODUCT_INVENTORY_MANAGER]: [
    'products.view',
    'products.create',
    'products.edit',
    'products.delete',
    'categories.view',
    'categories.manage',
    'inventory.view',
    'inventory.update',
    'inventory.adjust',
    'activity_logs.view_scoped',
  ],
  [ROLES.ORDER_MANAGER]: [
    'orders.view',
    'orders.process',
    'orders.update_status',
    'shipments.view',
    'shipments.update',
    'returns.view',
    'returns.process',
    'refunds.view',
    'refunds.process',
    'activity_logs.view_scoped',
  ],
  [ROLES.CUSTOMER_SUPPORT_EXECUTIVE]: [
    'support.view',
    'support.reply',
    'support.update',
    'support.assign',
    'orders.view',
    'shipments.view',
    'customers.view',
    'activity_logs.view_scoped',
  ],
  [ROLES.CUSTOMER_SUPPORT]: [
    'support.view',
    'support.reply',
    'support.update',
    'support.assign',
    'orders.view',
    'shipments.view',
    'customers.view',
    'activity_logs.view_scoped',
  ],
  [ROLES.MARKETING_MANAGER]: [
    'coupons.view',
    'coupons.create',
    'coupons.edit',
    'coupons.activate',
    'reviews.view',
    'reviews.moderate',
    'activity_logs.view_scoped',
  ],
  [ROLES.FINANCE_MANAGER]: [
    'payments.view',
    'payments.process',
    'finance.reports',
    'refunds.view',
    'refunds.process',
    'activity_logs.view_scoped',
  ],
  [ROLES.OPERATIONS]: [
    'orders.view',
    'orders.process',
    'orders.update_status',
    'shipments.view',
    'shipments.update',
    'inventory.view',
    'inventory.update',
    'inventory.adjust',
    'products.view',
    'activity_logs.view_scoped',
  ],
};
