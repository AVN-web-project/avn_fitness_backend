import { ORDER_STATUS } from '../config/constants.js';
import { ApiError } from './apiError.js';

/**
 * Valid transitions map for Order lifecycle state machine
 */
export const ALLOWED_ORDER_TRANSITIONS = {
  [ORDER_STATUS.PENDING_PAYMENT]: [
    ORDER_STATUS.PAID_CONFIRMED,
    ORDER_STATUS.PAYMENT_FAILED,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.PAID_CONFIRMED]: [
    ORDER_STATUS.PROCESSING,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.PROCESSING]: [
    ORDER_STATUS.SHIPPED,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.SHIPPED]: [
    ORDER_STATUS.DELIVERED,
    ORDER_STATUS.RETURN_REQUESTED,
  ],
  [ORDER_STATUS.DELIVERED]: [
    ORDER_STATUS.RETURN_REQUESTED,
  ],
  [ORDER_STATUS.RETURN_REQUESTED]: [
    ORDER_STATUS.RETURNED,
    ORDER_STATUS.DELIVERED, // When return is rejected
  ],
  [ORDER_STATUS.RETURNED]: [
    ORDER_STATUS.REFUNDED,
  ],
  [ORDER_STATUS.CANCELLED]: [
    ORDER_STATUS.REFUNDED, // If refund needed after cancellation of paid order
  ],
  [ORDER_STATUS.REFUNDED]: [],
  [ORDER_STATUS.PAYMENT_FAILED]: [],
};

/**
 * Validate order state transition
 */
export const validateOrderTransition = (currentState, nextState, allowAdminOverride = false) => {
  if (currentState === nextState) {
    return true;
  }

  if (allowAdminOverride) {
    return true;
  }

  const allowed = ALLOWED_ORDER_TRANSITIONS[currentState] || [];
  if (!allowed.includes(nextState)) {
    throw ApiError.badRequest(
      `Invalid order state transition from '${currentState}' to '${nextState}'. Allowed transitions: ${allowed.join(', ') || 'None (Terminal state)'}`
    );
  }

  return true;
};
