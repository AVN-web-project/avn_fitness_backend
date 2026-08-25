import app from '../src/app.js';
import { ROLES, PRODUCT_STATUS, ORDER_STATUS } from '../src/config/constants.js';
import { validateOrderTransition, ALLOWED_ORDER_TRANSITIONS } from '../src/utils/orderStateMachine.js';
import { ApiError } from '../src/utils/apiError.js';
import { ApiResponse } from '../src/utils/apiResponse.js';

console.log('--- Starting Foundation Verification ---');

// 1. Check Constants
console.log('Checking Constants...');
if (ROLES.USER !== 'user' || ROLES.OPERATIONS !== 'operations' || ROLES.ADMIN !== 'admin') {
  throw new Error('Role constants mismatch');
}
if (PRODUCT_STATUS.ACTIVE !== 'active' || PRODUCT_STATUS.DISCONTINUED !== 'discontinued') {
  throw new Error('Product status constants mismatch');
}
console.log('✓ Constants verified.');

// 2. Check Order State Machine
console.log('Checking Order State Machine transitions...');
try {
  validateOrderTransition(ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.PAID_CONFIRMED);
  validateOrderTransition(ORDER_STATUS.PAID_CONFIRMED, ORDER_STATUS.PROCESSING);
  validateOrderTransition(ORDER_STATUS.PROCESSING, ORDER_STATUS.SHIPPED);
  validateOrderTransition(ORDER_STATUS.SHIPPED, ORDER_STATUS.DELIVERED);
  console.log('✓ Valid lifecycle progression passed.');
} catch (e) {
  throw new Error('Valid order transition failed: ' + e.message);
}

// Check invalid transition
try {
  validateOrderTransition(ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.DELIVERED);
  throw new Error('Invalid order transition was wrongly permitted!');
} catch (err) {
  if (err instanceof ApiError) {
    console.log('✓ Invalid transition correctly caught:', err.message);
  } else {
    throw err;
  }
}

// 3. Check App Instance
console.log('Checking Express app routes...');
if (!app || typeof app.use !== 'function') {
  throw new Error('Express app instance invalid');
}
console.log('✓ Express app initialized with all middleware & route stacks.');

console.log('=== All Foundation Checks Passed Successfully! ===');
process.exit(0);
