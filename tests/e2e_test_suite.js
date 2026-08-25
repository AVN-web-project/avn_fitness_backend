import http from 'http';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { User } from '../src/models/user.model.js';
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
import { ROLES, PRODUCT_STATUS, ORDER_STATUS, DISCOUNT_TYPE } from '../src/config/constants.js';

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
    const regRes = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'John Doe Customer',
        email: 'john@example.com',
        password: 'Password123',
        phone: '+919988776655',
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
      }),
    });
    assert(dupRes.status === 409, 'Duplicate email registration returns 409 Conflict');

    // Create Admin and Operations users
    const adminUser = await User.create({
      name: 'Admin User',
      email: 'admin@avn.com',
      password: 'AdminPassword123',
      role: ROLES.ADMIN,
    });
    const opsUser = await User.create({
      name: 'Ops User',
      email: 'ops@avn.com',
      password: 'OpsPassword123',
      role: ROLES.OPERATIONS,
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

    // ==========================================
    // TEST SUITE 6: Operations Fulfillment & Dispatch
    // ==========================================
    console.log('\n--- TEST SUITE 6: Operations Order Fulfillment Pipeline ---');

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

    // Operations moderates review
    const modRes = await request(`/reviews/${reviewId}/moderate`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${opsToken}` },
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

    // Operations records refund settlement
    const refundRes = await request(`/operations/orders/${orderId}/refund`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opsToken}` },
      body: JSON.stringify({
        refundTransactionId: 'ref_rzp_mock_999888',
        reason: 'Return settlement completed',
      }),
    });
    assert(refundRes.status === 200, 'Operations records refund');
    assert(refundRes.body.data.order.orderStatus === ORDER_STATUS.REFUNDED, 'Order transitions to refunded');

    // ==========================================
    // TEST SUITE 9: Customer Support Inquiries
    // ==========================================
    console.log('\n--- TEST SUITE 9: Customer Care & Support Tickets ---');

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

    // Operations replies to ticket
    const replyRes = await request(`/support/${ticketId}/reply`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opsToken}` },
      body: JSON.stringify({
        message: 'The unstretched circumference is 12 inches (30 cm).',
      }),
    });
    assert(replyRes.status === 200, 'Operations posts resolution reply to ticket');
    assert(replyRes.body.data.ticket.status === 'in_progress', 'Ticket status moves to in_progress');

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
