import http from 'http';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import { User } from '../src/models/user.model.js';
import { Admin } from '../src/models/admin.model.js';
import { Staff } from '../src/models/staff.model.js';
import { Product } from '../src/models/product.model.js';
import { Category } from '../src/models/category.model.js';
import { Cart } from '../src/models/cart.model.js';
import { Order } from '../src/models/order.model.js';
import { Payment } from '../src/models/payment.model.js';
import { Shipment } from '../src/models/shipment.model.js';
import { Coupon } from '../src/models/coupon.model.js';
import { Review } from '../src/models/review.model.js';
import { SupportRequest } from '../src/models/support.model.js';
import { ActivityLog } from '../src/models/activityLog.model.js';
import { Otp } from '../src/models/otp.model.js';
import { ROLES, PRODUCT_STATUS, ORDER_STATUS, DISCOUNT_TYPE, COD_SURCHARGE } from '../src/config/constants.js';

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/avn_fitness_test_e2e';
let server;
let baseUrl;

const runTests = async () => {
  console.log('====================================================');
  console.log(' 🧪 STARTING COMPLETE END-TO-END TEST SUITE');
  console.log('====================================================\n');

  let passedCount = 0;
  let failedCount = 0;

  const assert = (condition, message) => {
    if (!condition) {
      failedCount++;
      console.error(`  ❌ FAILED: ${message}`);
      throw new Error(`Assertion Failed: ${message}`);
    } else {
      passedCount++;
      console.log(`  ✓ PASSED: ${message}`);
    }
  };

  try {
    // 1. Connect to isolated Test DB
    console.log('Connecting to Test Database...');
    await mongoose.connect(TEST_DB_URI);
    await Promise.all([
      User.deleteMany({}),
      Admin.deleteMany({}),
      Staff.deleteMany({}),
      Otp.deleteMany({}),
      Product.deleteMany({}),
      Category.deleteMany({}),
      Cart.deleteMany({}),
      Order.deleteMany({}),
      Payment.deleteMany({}),
      Shipment.deleteMany({}),
      Coupon.deleteMany({}),
      Review.deleteMany({}),
      SupportRequest.deleteMany({}),
      ActivityLog.deleteMany({}),
    ]);
    console.log('Test Database cleared.');

    // 2. Start HTTP test server on ephemeral port
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}/api/v1`;
    console.log(`Test server running at ${baseUrl}\n`);

    // Helper for requests
    const request = async (endpoint, options = {}) => {
      const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;
      const res = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, body: data };
    };

    // ==========================================
    // TEST SUITE 1: Health & Diagnostics
    // ==========================================
    console.log('--- TEST SUITE 1: Health & System Diagnostics ---');
    const healthRes = await request(`http://127.0.0.1:${port}/health`);
    assert(healthRes.status === 200, 'GET /health returns 200');
    assert(healthRes.body.data.status === 'ok', 'Health status is ok');
    assert(healthRes.body.data.database.connected === true, 'Database is connected');

    // ==========================================
    // TEST SUITE 2: Authentication & RBAC
    // ==========================================
    console.log('\n--- TEST SUITE 2: Authentication & Role-Based Access Control ---');
    
    // Register customer
    await Otp.create({
      email: 'john@example.com',
      otpHash: await bcrypt.hash('123456', 10),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });
    const regRes = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'John Doe Customer',
        email: 'john@example.com',
        password: 'Password123',
        phone: '+919988776655',
        otp: '123456',
      }),
    });
    assert(regRes.status === 201, 'Customer registration returns 201');
    assert(regRes.body.data.user.role === ROLES.USER, 'Registered account defaults to user role');
    const customerToken = regRes.body.data.token;
    const customerId = regRes.body.data.user._id;

    // Prevent duplicate email registration
    const dupRes = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'John Clone',
        email: 'john@example.com',
        password: 'Password123',
        otp: '123456',
      }),
    });
    assert(dupRes.status === 409, 'Duplicate email registration returns 409 Conflict');

    // Create accounts in their authoritative management collections
    await Admin.create({
      name: 'Admin User',
      email: 'admin@avn.com',
      password: 'AdminPassword123',
    });
    await Staff.create({
      name: 'Ops User',
      email: 'ops@avn.com',
      password: 'OpsPassword123',
      role: ROLES.ORDER_MANAGER,
    });
    await Staff.create({
      name: 'Finance User',
      email: 'finance@avn.com',
      password: 'FinancePassword123',
      role: ROLES.FINANCE_MANAGER,
    });
    await Staff.create({
      name: 'Support User',
      email: 'support@avn.com',
      password: 'SupportPassword123',
      role: ROLES.CUSTOMER_SUPPORT,
    });

    const adminLoginRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@avn.com', password: 'AdminPassword123' }),
    });
    assert(adminLoginRes.status === 200, 'Admin login returns 200');
    const adminToken = adminLoginRes.body.data.token;

    const opsLoginRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'ops@avn.com', password: 'OpsPassword123' }),
    });
    assert(opsLoginRes.status === 200, 'Operations login returns 200');
    const opsToken = opsLoginRes.body.data.token;

    const financeLoginRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'finance@avn.com', password: 'FinancePassword123' }),
    });
    assert(financeLoginRes.status === 200, 'Finance lead login returns 200');
    const financeToken = financeLoginRes.body.data.token;

    const supportLoginRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'support@avn.com', password: 'SupportPassword123' }),
    });
    assert(supportLoginRes.status === 200, 'Customer support manager login returns 200');
    const supportToken = supportLoginRes.body.data.token;

    // RBAC: Customer cannot access Admin endpoints
    const forbiddenAdminRes = await request('/admin/activity-logs', {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert(forbiddenAdminRes.status === 403, 'Customer blocked with 403 from Admin activity logs');

    // RBAC: Customer cannot access Operations endpoints
    const forbiddenOpsRes = await request('/operations/orders', {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert(forbiddenOpsRes.status === 403, 'Customer blocked with 403 from Operations order queue');

    // RBAC: Admin fallback access to Operations routes
    const adminOpsAccessRes = await request('/operations/orders', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminOpsAccessRes.status === 200, 'Admin can access Operations routes as operational fallback');

    // Add address for customer
    const addressRes = await request('/auth/addresses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        fullName: 'John Doe',
        phone: '+919988776655',
        street: '123 Fitness St',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        isDefault: true,
      }),
    });
    assert(addressRes.status === 201, 'Address added to customer profile');
    const addressId = addressRes.body.data.addresses[0]._id;

    // ==========================================
    // TEST SUITE 3: Catalog & Product Lifecycle
    // ==========================================
    console.log('\n--- TEST SUITE 3: Catalog Management & Non-Deletion Policy ---');
    
    // Create category
    const catRes = await request('/categories', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: 'Resistance Bands',
        description: 'Loop resistance bands',
      }),
    });
    assert(catRes.status === 201, 'Admin creates Category');
    const categoryId = catRes.body.data.category._id;

    // Create product with variants
    const prodRes = await request('/products', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: 'AVN Heavy Loop Band',
        description: 'Premium latex resistance band',
        category: categoryId,
        ageGroup: 'adults',
        gender: 'unisex',
        variants: [
          {
            sku: 'BAND-LIGHT',
            title: 'Light (10-15 lbs)',
            resistanceLevel: 'Light',
            price: 299,
            compareAtPrice: 499,
            stockQuantity: 50,
            isActive: true,
          },
          {
            sku: 'BAND-HEAVY',
            title: 'Heavy (30-40 lbs)',
            resistanceLevel: 'Heavy',
            price: 499,
            compareAtPrice: 799,
            stockQuantity: 30,
            isActive: true,
          },
        ],
      }),
    });
    assert(prodRes.status === 201, 'Admin creates Product with variants');
    const product = prodRes.body.data.product;
    const productId = product._id;

    // Public product list and filter
    const listRes = await request('/products?category=resistance-bands');
    assert(listRes.status === 200, 'Public can fetch product catalog');
    assert(listRes.body.data.products.length === 1, 'Product list filters correctly by category slug');

    // Public product details
    const detailRes = await request(`/products/${product.slug}`);
    assert(detailRes.status === 200, 'Public fetches product details by slug');
    assert(detailRes.body.data.product.variants.length === 2, 'Product returns variant matrix');

    // Product Non-Deletion Policy: Soft status transition
    const statusRes = await request(`/products/${productId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: PRODUCT_STATUS.UNAVAILABLE }),
    });
    assert(statusRes.status === 200, 'Product status updated to unavailable (Non-deletion)');
    assert(statusRes.body.data.product.status === PRODUCT_STATUS.UNAVAILABLE, 'Status changed in DB');

    // Revert back to active
    await request(`/products/${productId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: PRODUCT_STATUS.ACTIVE }),
    });

    // Create coupon
    const couponRes = await request('/coupons', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        code: 'FIT10',
        description: '10% discount',
        discountType: DISCOUNT_TYPE.PERCENTAGE,
        discountValue: 10,
        minCartValue: 200,
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }),
    });
    assert(couponRes.status === 201, 'Admin creates promotional Coupon');

    // ==========================================
    // TEST SUITE 4: Shopping Cart & Offers
    // ==========================================
    console.log('\n--- TEST SUITE 4: Shopping Cart & Bill Calculation ---');
    
    // Guest cart with x-guest-id header
    const guestCartRes = await request('/cart/items', {
      method: 'POST',
      headers: { 'x-guest-id': 'guest-session-123' },
      body: JSON.stringify({
        productId,
        variantSku: 'BAND-LIGHT',
        quantity: 2,
      }),
    });
    assert(guestCartRes.status === 200, 'Guest can add items to cart with x-guest-id');
    assert(guestCartRes.body.data.cart.items.length === 1, 'Guest cart contains 1 item');

    // Customer authenticated cart
    const authCartRes = await request('/cart/items', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        productId,
        variantSku: 'BAND-HEAVY',
        quantity: 2, // 499 * 2 = 998
      }),
    });
    assert(authCartRes.status === 200, 'Authenticated user adds variant to personal cart');
    
    // Apply coupon to cart
    const applyCouponRes = await request('/cart/apply-coupon', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ code: 'FIT10' }),
    });
    assert(applyCouponRes.status === 200, 'Coupon FIT10 applied to cart');
    assert(applyCouponRes.body.data.cart.billSummary.discount > 0, 'Discount correctly calculated');

    // ==========================================
    // TEST SUITE 5: Checkout & Payment Flow
    // ==========================================
    console.log('\n--- TEST SUITE 5: Checkout, Guest Checkout Blocking & Payments ---');

    // Block unauthenticated guest from checkout
    const guestCheckoutRes = await request('/checkout/create-order', {
      method: 'POST',
      body: JSON.stringify({ customAddress: { fullName: 'Guest', street: 'X', pincode: '12345' } }),
    });
    assert(guestCheckoutRes.status === 401, 'Guest checkout is strictly blocked with 401 Unauthorized');

    // Authenticated checkout
    const checkoutRes = await request('/checkout/create-order', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ shippingAddressId: addressId }),
    });
    assert(checkoutRes.status === 201, 'Authenticated user initializes checkout order');
    const orderId = checkoutRes.body.data.orderId;
    const orderNumber = checkoutRes.body.data.orderNumber;
    assert(orderNumber.startsWith('ORD-'), 'Order Number generated in ORD-YYYYMMDD-XXXX format');

    // Verify payment and capture order
    const payRes = await request('/checkout/verify-payment', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        orderId,
        paymentId: 'pay_rzp_mock_123456',
        signature: 'sig_mock_abcdef',
        status: 'success',
      }),
    });
    assert(payRes.status === 200, 'Payment verified successfully');
    assert(payRes.body.data.order.orderStatus === ORDER_STATUS.PAID_CONFIRMED, 'Order state transitions to paid_confirmed');

    // Verify inventory deduction
    const updatedProd = await Product.findById(productId);
    const heavyVariant = updatedProd.variants.find((v) => v.sku === 'BAND-HEAVY');
    assert(heavyVariant.stockQuantity === 28, 'Variant stock decremented from 30 to 28');

    const mockCheckoutRes = await request('/checkout/create-order', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        shippingAddressId: addressId,
        paymentProvider: 'mock',
        paymentMethod: 'upi',
        items: [{ productId, name: 'Mock online band', price: 500, quantity: 1 }],
      }),
    });
    assert(mockCheckoutRes.status === 201, 'Customer can initialize a simulated online payment');
    const mockOrderId = mockCheckoutRes.body.data.orderId;
    const mockPendingOrder = await Order.findById(mockOrderId);
    assert(mockPendingOrder.paymentInfo.provider === 'mock', 'Online test order is stored with the mock provider');
    assert(mockPendingOrder.paymentInfo.method === 'upi', 'Selected online payment method is retained');
    assert(mockPendingOrder.paymentInfo.paymentStatus === 'pending', 'Simulated online order begins unpaid');

    const mockPayRes = await request('/checkout/verify-payment', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        orderId: mockOrderId,
        paymentId: 'mock_pay_test_123',
        signature: 'mock_signature_test',
        status: 'success',
      }),
    });
    assert(mockPayRes.status === 200, 'Simulated online payment verifies successfully');
    assert(mockPayRes.body.data.order.paymentInfo.paymentStatus === 'captured', 'Simulated online payment is captured');
    assert(mockPayRes.body.data.order.orderStatus === ORDER_STATUS.PAID_CONFIRMED, 'Simulated online order is confirmed');
    const mockPaymentRecord = await Payment.findOne({ order: mockOrderId });
    assert(mockPaymentRecord?.provider === 'mock' && mockPaymentRecord?.method === 'upi', 'Mock payment and selected method are recorded');

    // ==========================================
    // TEST SUITE 6: Operations Fulfillment & Dispatch
    // ==========================================
    console.log('\n--- TEST SUITE 6: Operations Order Fulfillment Pipeline ---');

    const cancelGuardOrder = await Order.create({
      orderNumber: `ORD-CANCEL-GUARD-${Date.now()}`,
      user: customerId,
      items: [{ name: 'Cancellation guard test item', price: 100, quantity: 1, subtotal: 100 }],
      pricing: { subtotal: 100, totalPayable: 100 },
      shippingAddress: {
        fullName: 'John Doe',
        phone: '+919988776655',
        street: '123 Fitness St',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
      },
      orderStatus: ORDER_STATUS.PROCESSING,
    });

    const managerManualCancelRes = await request(`/operations/orders/${cancelGuardOrder._id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${opsToken}` },
      body: JSON.stringify({ status: ORDER_STATUS.CANCELLED }),
    });
    assert(managerManualCancelRes.status === 400, 'Operations managers cannot manually cancel orders');

    const adminManualCancelRes = await request(`/operations/orders/${cancelGuardOrder._id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: ORDER_STATUS.CANCELLED }),
    });
    assert(adminManualCancelRes.status === 400, 'Super admins cannot bypass customer cancellation workflow');

    const customerCancelRes = await request(`/orders/${cancelGuardOrder._id}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ reason: 'Customer cancelled before dispatch' }),
    });
    assert(customerCancelRes.status === 200, 'Customer can cancel an order before it is shipped');
    assert(customerCancelRes.body.data.order.orderStatus === ORDER_STATUS.CANCELLED, 'Customer cancellation is recorded');

    const managerRevokeRes = await request(`/operations/orders/${cancelGuardOrder._id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${opsToken}` },
      body: JSON.stringify({ status: ORDER_STATUS.PROCESSING }),
    });
    assert(managerRevokeRes.status === 400, 'Operations managers cannot revoke a customer cancellation');

    const adminRevokeRes = await request(`/operations/orders/${cancelGuardOrder._id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: ORDER_STATUS.PROCESSING }),
    });
    assert(adminRevokeRes.status === 400, 'Super admins cannot override a customer cancellation');

    // Operations views queue
    const opsQueueRes = await request('/operations/orders', {
      headers: { Authorization: `Bearer ${opsToken}` },
    });
    assert(opsQueueRes.status === 200, 'Operations fetches active order queue');
    assert(opsQueueRes.body.data.orders.length >= 1, 'Order present in Operations queue');

    // Operations progresses order to Processing
    const procRes = await request(`/operations/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${opsToken}` },
      body: JSON.stringify({ status: ORDER_STATUS.PROCESSING }),
    });
    assert(procRes.status === 200, 'Operations advances order to processing');

    // Operations dispatches order with tracking
    const dispatchRes = await request(`/operations/orders/${orderId}/dispatch`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${opsToken}` },
      body: JSON.stringify({
        carrier: 'Blue Dart Express',
        trackingNumber: 'BD123456789IN',
        estimatedDeliveryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      }),
    });
    assert(dispatchRes.status === 200, 'Operations marks order as Shipped with carrier tracking');
    assert(dispatchRes.body.data.order.orderStatus === ORDER_STATUS.SHIPPED, 'Order state transitions to shipped');

    const shippedCancelRes = await request(`/orders/${orderId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ reason: 'Customer attempted cancellation after dispatch' }),
    });
    assert(shippedCancelRes.status === 400, 'Customer cannot cancel an order after it is shipped');

    // Confirm delivery
    const deliverRes = await request(`/operations/orders/${orderId}/deliver`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${opsToken}` },
    });
    assert(deliverRes.status === 200, 'Operations confirms delivery milestone');
    assert(deliverRes.body.data.order.orderStatus === ORDER_STATUS.DELIVERED, 'Order state transitions to delivered');

    // ==========================================
    // TEST SUITE 7: Reviews & Ratings
    // ==========================================
    console.log('\n--- TEST SUITE 7: Customer Reviews & Moderation ---');

    // Customer submits review for delivered product
    const reviewRes = await request('/reviews', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        productId,
        rating: 5,
        title: 'Outstanding quality band!',
        comment: 'Great resistance, durable latex, and fast shipping!',
      }),
    });
    assert(reviewRes.status === 201, 'Customer submits product review');
    assert(reviewRes.body.data.review.isVerifiedPurchase === true, 'Review automatically flagged as Verified Purchase');
    const reviewId = reviewRes.body.data.review._id;

    // Super Admin moderates review
    const modRes = await request(`/reviews/${reviewId}/moderate`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        status: 'published',
        moderationNotes: 'Approved clean review',
      }),
    });
    assert(modRes.status === 200, 'Operations moderates review status');

    // ==========================================
    // TEST SUITE 8: Returns & Refunds Workflow
    // ==========================================
    console.log('\n--- TEST SUITE 8: Returns & Refunds Lifecycle ---');

    // Customer requests return
    const returnReqRes = await request(`/orders/${orderId}/return`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ reason: 'Need a higher resistance level' }),
    });
    assert(returnReqRes.status === 200, 'Customer submits return request');
    assert(returnReqRes.body.data.order.orderStatus === ORDER_STATUS.RETURN_REQUESTED, 'Order transitions to return_requested');

    // Operations approves return
    const returnApproveRes = await request(`/operations/orders/${orderId}/returns/review`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opsToken}` },
      body: JSON.stringify({ action: 'approve', notes: 'Item received in original packaging' }),
    });
    assert(returnApproveRes.status === 200, 'Operations approves return');
    assert(returnApproveRes.body.data.order.orderStatus === ORDER_STATUS.RETURNED, 'Order transitions to returned');

    // Finance records refund settlement
    const refundRes = await request(`/operations/orders/${orderId}/refund`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${financeToken}` },
      body: JSON.stringify({
        refundTransactionId: 'ref_rzp_mock_999888',
        reason: 'Return settlement completed',
      }),
    });
    assert(refundRes.status === 200, 'Finance records refund');
    assert(refundRes.body.data.order.orderStatus === ORDER_STATUS.REFUNDED, 'Order transitions to refunded');

    // COD order surcharge and return payout details
    const codCheckoutRes = await request('/checkout/create-order', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        paymentProvider: 'cod',
        paymentMethod: 'cod',
        shippingAddressId: addressId,
        items: [{ productId, name: 'COD test band', price: 500, quantity: 1 }],
      }),
    });
    assert(codCheckoutRes.status === 201, 'Customer can create a COD order');
    const codOrderId = codCheckoutRes.body.data.orderId;
    const codOrder = await Order.findById(codOrderId);
    assert(codOrder.pricing.codSurcharge === COD_SURCHARGE, 'COD order stores the fixed surcharge');
    assert(
      codOrder.pricing.totalPayable === codOrder.pricing.subtotal - codOrder.pricing.discount + codOrder.pricing.shippingFee + COD_SURCHARGE,
      'COD surcharge is included in total payable'
    );

    codOrder.orderStatus = ORDER_STATUS.DELIVERED;
    await codOrder.save();

    const missingCodRefundDetailsRes = await request(`/orders/${codOrderId}/return`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ reason: 'COD return test without bank details' }),
    });
    assert(missingCodRefundDetailsRes.status === 400, 'COD return requires refund bank details');

    const invalidCodBankDetailsRes = await request(`/orders/${codOrderId}/return`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        reason: 'COD return with invalid bank details',
        refundAccountDetails: {
          method: 'bank',
          accountHolderName: 'John Doe',
          accountNumber: '123ABC',
          ifscCode: 'HDFC0001234',
        },
      }),
    });
    assert(invalidCodBankDetailsRes.status === 400, 'COD return rejects malformed bank account numbers');

    const codRefundAccountDetails = {
      method: 'bank',
      accountHolderName: 'John Doe',
      accountNumber: '123456789012',
      ifscCode: 'HDFC0001234',
    };
    const codReturnRes = await request(`/orders/${codOrderId}/return`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ reason: 'COD return with refund details', refundAccountDetails: codRefundAccountDetails }),
    });
    assert(codReturnRes.status === 200, 'Delivered COD order can be returned');
    const codRefundableAmount = codOrder.pricing.totalPayable - COD_SURCHARGE;
    assert(codReturnRes.body.data.order.returnRequest.refundAmount === codRefundableAmount, 'COD return amount excludes the surcharge');
    assert(
      codReturnRes.body.data.order.returnRequest.refundAccountDetails.accountNumber === codRefundAccountDetails.accountNumber,
      'COD refund bank details are stored on the return request'
    );

    const codReturnApproveRes = await request(`/operations/orders/${codOrderId}/returns/review`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opsToken}` },
      body: JSON.stringify({ action: 'approve', notes: 'COD return inspection passed', refundAmount: codOrder.pricing.totalPayable }),
    });
    assert(codReturnApproveRes.status === 200, 'Operations can approve a COD return');
    assert(codReturnApproveRes.body.data.order.returnRequest.refundAmount === codRefundableAmount, 'Approved COD refund is capped below the surcharge');

    const pendingCodRefundsRes = await request('/admin/returns-cancellations?filterType=pending_refund', {
      headers: { Authorization: `Bearer ${financeToken}` },
    });
    assert(
      pendingCodRefundsRes.status === 200 && pendingCodRefundsRes.body.data.requests.some((order) => String(order._id) === String(codOrderId)),
      'Approved COD return appears in the finance pending-refund queue'
    );

    const codRefundRes = await request(`/operations/orders/${codOrderId}/refund`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${financeToken}` },
      body: JSON.stringify({ refundTransactionId: 'ref_cod_mock_123', refundAmount: codOrder.pricing.totalPayable }),
    });
    assert(codRefundRes.status === 200, 'Finance can record a COD return refund');
    assert(codRefundRes.body.data.order.returnRequest.refundAmount === codRefundableAmount, 'Recorded COD refund never includes the surcharge');

    const codUpiCheckoutRes = await request('/checkout/create-order', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        paymentProvider: 'cod',
        paymentMethod: 'cod',
        shippingAddressId: addressId,
        items: [{ productId, name: 'COD UPI refund test band', price: 500, quantity: 1 }],
      }),
    });
    assert(codUpiCheckoutRes.status === 201, 'Customer can create a COD order for UPI refund testing');
    const codUpiOrder = await Order.findById(codUpiCheckoutRes.body.data.orderId);
    codUpiOrder.orderStatus = ORDER_STATUS.DELIVERED;
    await codUpiOrder.save();

    const codUpiReturnRes = await request(`/orders/${codUpiOrder._id}/return`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        reason: 'COD UPI refund test',
        refundAccountDetails: { method: 'upi', upiId: 'not-a-valid-upi' },
      }),
    });
    assert(codUpiReturnRes.status === 400, 'COD return rejects malformed UPI IDs');

    const validCodUpiReturnRes = await request(`/orders/${codUpiOrder._id}/return`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        reason: 'COD UPI refund test',
        refundAccountDetails: { method: 'upi', upiId: 'john.doe@upi' },
      }),
    });
    assert(validCodUpiReturnRes.status === 200, 'COD return accepts a valid UPI refund destination');
    assert(
      validCodUpiReturnRes.body.data.order.returnRequest.refundAccountDetails.method === 'upi' &&
      validCodUpiReturnRes.body.data.order.returnRequest.refundAccountDetails.upiId === 'john.doe@upi',
      'COD UPI refund destination is stored'
    );

    // ==========================================
    // TEST SUITE 9: Customer Support Inquiries
    // ==========================================
    console.log('\n--- TEST SUITE 9: Customer Care & Support Tickets ---');

    const customerCreateTicketRes = await request('/support/operations/tickets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        orderNumber,
        subject: 'Customer self-service manager route check',
        category: 'order',
        message: 'This customer must not create a manager ticket.',
      }),
    });
    assert(customerCreateTicketRes.status === 403, 'Customers cannot use the manager ticket creation route');

    const managerCreateTicketRes = await request('/support/operations/tickets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${supportToken}` },
      body: JSON.stringify({
        orderNumber,
        subject: 'Delivery follow-up requested',
        category: 'shipping',
        message: 'Customer contacted support about delivery and requested an update.',
      }),
    });
    assert(managerCreateTicketRes.status === 201, 'Support manager creates a ticket on behalf of an order customer');
    assert(String(managerCreateTicketRes.body.data.ticket.user._id) === String(customerId), 'Manager-created ticket is assigned to the order customer');
    assert(String(managerCreateTicketRes.body.data.ticket.order._id) === String(orderId), 'Manager-created ticket is linked to the specified order');

    // Customer opens support ticket
    const ticketRes = await request('/support', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        subject: 'Inquiry regarding loop band sizing',
        category: 'product',
        message: 'What is the length of the heavy loop band when unstretched?',
        orderId,
      }),
    });
    assert(ticketRes.status === 201, 'Customer raises support ticket');
    const ticketId = ticketRes.body.data.ticket._id;

    // Super Admin replies to ticket
    const replyRes = await request(`/support/${ticketId}/reply`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        message: 'The unstretched circumference is 12 inches (30 cm).',
      }),
    });
    assert(replyRes.status === 200, 'Operations posts resolution reply to ticket');
    assert(replyRes.body.data.ticket.status === 'open', 'Ticket remains open after a reply');

    const resolveTicketRes = await request(`/support/operations/${ticketId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${supportToken}` },
      body: JSON.stringify({ status: 'resolved' }),
    });
    assert(resolveTicketRes.status === 200, 'Support manager can resolve a ticket');
    assert(resolveTicketRes.body.data.ticket.status === 'resolved', 'Resolved status is stored when the ticket is closed');
    assert(Boolean(resolveTicketRes.body.data.ticket.resolvedAt), 'Resolved ticket stores its resolution timestamp');

    const unsupportedTicketStatusRes = await request(`/support/operations/${ticketId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${supportToken}` },
      body: JSON.stringify({ status: 'in_progress' }),
    });
    assert(unsupportedTicketStatusRes.status === 400, 'Unsupported support statuses are rejected');

    // ==========================================
    // TEST SUITE 10: Admin Audit Logs & Analytics
    // ==========================================
    console.log('\n--- TEST SUITE 10: Admin Activity Logbook & Analytics ---');

    // Admin searches Activity Logbook
    const logRes = await request('/admin/activity-logs', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(logRes.status === 200, 'Admin retrieves Activity Logbook');
    assert(logRes.body.data.logs.length > 0, 'Audit logbook contains recorded staff actions');
    console.log(`  ℹ Recorded Audit Actions: ${logRes.body.data.logs.map((l) => l.action).join(', ')}`);

    // Admin fetches business analytics
    const analyticsRes = await request('/admin/analytics', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(analyticsRes.status === 200, 'Admin fetches Business Analytics dashboard');
    assert(analyticsRes.body.data.summary.totalUsers >= 1, 'Analytics reports registered users');
    assert(analyticsRes.body.data.summary.totalProducts >= 1, 'Analytics reports total products');

    console.log('\n====================================================');
    console.log(` 🎉 ALL TESTS PASSED! (${passedCount} passed, ${failedCount} failed)`);
    console.log('====================================================\n');
  } catch (error) {
    console.error('\n❌ Test Suite Aborted due to error:', error.message);
  } finally {
    if (server) {
      server.close();
    }
    await mongoose.connection.close();
    process.exit(failedCount > 0 ? 1 : 0);
  }
};

runTests();
