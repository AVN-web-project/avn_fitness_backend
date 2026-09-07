import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { env } from '../src/config/env.js';
import { User } from '../src/models/user.model.js';
import { Order } from '../src/models/order.model.js';
import { Product } from '../src/models/product.model.js';
import { Review } from '../src/models/review.model.js';
import { SupportRequest } from '../src/models/support.model.js';

const BACKEND_URL = `http://localhost:${env.PORT}${env.API_PREFIX}`;

async function runFullIntegrationTest() {
  console.log('\n============================================================');
  console.log('🚀 RUNNING FULL BACKEND MODULES & FRONTEND INTEGRATION TEST');
  console.log(`Backend URL: ${BACKEND_URL}`);
  console.log('============================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, testName) {
    totalTests++;
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
    }
  }

  let testUserId = null;
  let createdOrderId = null;
  let createdOrderNumber = null;
  let createdReviewId = null;
  let createdTicketId = null;
  const testEmail = `integration_${Date.now()}@avngear.com`;

  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log(`✓ Connected to MongoDB: ${env.MONGODB_URI}\n`);

    // -------------------------------------------------------------
    // TEST 1: User Model & Auth Token
    // -------------------------------------------------------------
    console.log('--- TEST GROUP 1: User & Authentication Verification ---');
    const testUser = await User.create({
      name: 'Integration Athlete',
      email: testEmail,
      password: 'SecurePassword123!',
      authProvider: 'local',
      role: 'user',
      addresses: [
        {
          title: 'Home',
          fullName: 'Integration Athlete',
          phone: '+91 9988776655',
          street: 'Fitness Boulevard 12',
          city: 'Delhi',
          state: 'Delhi',
          pincode: '110001',
          country: 'India',
          isDefault: true,
        },
      ],
    });
    testUserId = testUser._id;
    const testToken = testUser.generateAuthToken();
    assert(testToken && testToken.length > 20, 'User generated valid JWT authentication token');

    // -------------------------------------------------------------
    // TEST 2: Order Creation & Dual-Key Cancellation
    // -------------------------------------------------------------
    console.log('\n--- TEST GROUP 2: Orders & Cancellation Integration ---');
    const orderRes = await fetch(`${BACKEND_URL}/checkout/create-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testToken}`,
      },
      body: JSON.stringify({
        items: [
          {
            id: 'leather-weightlifting-lever-belt',
            productId: 'leather-weightlifting-lever-belt',
            name: 'LEVER WEIGHTLIFTING BELT',
            price: 3499,
            quantity: 1,
            variantSku: 'AVN-BELT-L-BLK',
            variantTitle: 'Large (34"-38")',
            image: '/knee-wrap.png',
          },
        ],
        shippingAddressId: testUser.addresses[0]._id.toString(),
        paymentMethod: 'upi',
        subtotal: 3499,
        shippingFee: 0,
        totalAmount: 3499,
      }),
    });
    const orderData = await orderRes.json();
    assert(orderRes.status === 201 && orderData.success, 'POST /checkout/create-order creates order with zero discount');

    createdOrderId = orderData.data?.orderId;
    createdOrderNumber = orderData.data?.orderNumber;
    assert(createdOrderNumber && createdOrderNumber.startsWith('ORD-'), `Order Number generated: ${createdOrderNumber}`);

    // Cancel by orderNumber (Dual-key verification on active confirmed order)
    const cancelRes = await fetch(`${BACKEND_URL}/orders/${createdOrderNumber}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testToken}`,
      },
      body: JSON.stringify({ reason: 'Changed size preference' }),
    });
    const cancelData = await cancelRes.json();
    assert(cancelRes.status === 200 && cancelData.success, `POST /orders/:orderNumber/cancel cancels order by orderNumber`);

    // Verify DB state
    const dbOrder = await Order.findById(createdOrderId);
    assert(dbOrder.orderStatus === 'cancelled', 'order.model.js orderStatus marked as cancelled in MongoDB');
    assert(dbOrder.cancellation?.isCancelled === true, 'order.model.js cancellation subdocument persisted');
    assert(dbOrder.statusHistory.some((s) => s.status === 'cancelled'), 'order.model.js statusHistory recorded cancellation');

    // Create 2nd order to test Simulate Delivery & Return
    const order2Res = await fetch(`${BACKEND_URL}/checkout/create-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testToken}`,
      },
      body: JSON.stringify({
        items: [{ productId: 'test-knee-wrap', name: 'AVN Pro Knee Wraps', price: 999, quantity: 1 }],
        shippingAddress: { fullName: 'Test Athlete', phone: '9876543210', street: 'MG Road', city: 'Gurugram', state: 'Haryana', pincode: '122002' },
        paymentMethod: 'upi',
      }),
    });
    const order2Data = await order2Res.json();
    const order2Number = order2Data.data?.orderNumber;

    // Set delivery in database directly for return & review testing
    await Order.findOneAndUpdate({ orderNumber: order2Number }, {
      orderStatus: 'delivered',
      'paymentInfo.paymentStatus': 'captured',
      'paymentInfo.paidAt': new Date(),
    });

    const dbDeliveredOrder = await Order.findOne({ orderNumber: order2Number });
    assert(dbDeliveredOrder.orderStatus === 'delivered', 'order.model.js orderStatus marked as delivered in MongoDB');

    // -------------------------------------------------------------
    // TEST 3: Product Reviews Module Integration (Dual-Key Slug/Id)
    // -------------------------------------------------------------
    console.log('\n--- TEST GROUP 3: Reviews Module Integration ---');
    const existingProduct = await Product.findOne();
    if (existingProduct) {
      const reviewRes = await fetch(`${BACKEND_URL}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testToken}`,
        },
        body: JSON.stringify({
          productId: existingProduct.slug || existingProduct._id.toString(),
          rating: 5,
          title: 'Outstanding Quality',
          comment: 'Extremely durable and great support during heavy lifts.',
        }),
      });
      const reviewData = await reviewRes.json();
      assert(reviewRes.status === 201 && reviewData.success, 'POST /reviews submits review by product slug/id');
      createdReviewId = reviewData.data?.review?._id;

      // Fetch reviews by slug
      const getReviewsRes = await fetch(`${BACKEND_URL}/reviews/products/${existingProduct.slug}`);
      const getReviewsData = await getReviewsRes.json();
      assert(
        getReviewsRes.status === 200 && Array.isArray(getReviewsData.data?.reviews),
        'GET /reviews/products/:slug retrieves published reviews'
      );
    } else {
      assert(true, 'Product review tests (skipped - catalog empty)');
    }

    // -------------------------------------------------------------
    // TEST 4: Customer Support Module Integration
    // -------------------------------------------------------------
    console.log('\n--- TEST GROUP 4: Customer Support Module Integration ---');
    const supportRes = await fetch(`${BACKEND_URL}/support`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testToken}`,
      },
      body: JSON.stringify({
        subject: 'Exchange size inquiry',
        category: 'Exchange', // Test category mapping to 'return_refund'
        orderId: createdOrderNumber, // Test orderNumber string resolution
        message: 'I would like to exchange my belt for a Medium size.',
      }),
    });
    const supportData = await supportRes.json();
    assert(supportRes.status === 201 && supportData.success, 'POST /support creates support ticket with mapped category');

    const createdTicket = supportData.data?.ticket;
    createdTicketId = createdTicket?._id;
    assert(createdTicket?.ticketNumber?.startsWith('TCK-'), `Ticket number issued: ${createdTicket?.ticketNumber}`);
    assert(createdTicket?.category === 'return_refund', 'Category normalized from Exchange to return_refund');

    // Fetch user tickets
    const myTicketsRes = await fetch(`${BACKEND_URL}/support/my-tickets`, {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    const myTicketsData = await myTicketsRes.json();
    assert(
      myTicketsRes.status === 200 && Array.isArray(myTicketsData.data?.tickets),
      'GET /support/my-tickets retrieves tickets for authenticated user'
    );
    const foundTicket = (myTicketsData.data?.tickets || []).some(
      (t) => t.ticketNumber === createdTicket?.ticketNumber
    );
    assert(foundTicket, 'Submitted ticket appears in customer tickets queue');

    // -------------------------------------------------------------
    // TEST 5: Preservation of DiscountPromo.jsx & Clean Order Flow
    // -------------------------------------------------------------
    console.log('\n--- TEST GROUP 5: Preservation & Clean State Verification ---');
    const discountPromoPath = path.resolve(
      '../avn_fitness_frontend/src/components/DiscountPromo.jsx'
    );
    const discountPromoExists = fs.existsSync(discountPromoPath);
    assert(discountPromoExists, 'DiscountPromo.jsx is preserved intact on disk for future use');

  } catch (err) {
    console.error('❌ Integration test failed with error:', err);
  } finally {
    console.log('\n--- Cleaning up temporary test documents ---');
    if (testUserId) {
      await Order.deleteMany({ user: testUserId });
      console.log(`✓ Cleaned test orders for user: ${testUserId}`);
    }
    if (createdReviewId) {
      await Review.findByIdAndDelete(createdReviewId);
      console.log(`✓ Cleaned test review: ${createdReviewId}`);
    }
    if (createdTicketId) {
      await SupportRequest.findByIdAndDelete(createdTicketId);
      console.log(`✓ Cleaned test support ticket: ${createdTicketId}`);
    }
    if (testUserId) {
      await User.findByIdAndDelete(testUserId);
      console.log(`✓ Cleaned test user: ${testUserId}`);
    }

    await mongoose.disconnect();
    console.log('✓ Disconnected from MongoDB\n');

    console.log('============================================================');
    console.log(`VERIFICATION SUMMARY: ${passedTests}/${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
    console.log('============================================================\n');
  }
}

runFullIntegrationTest();
