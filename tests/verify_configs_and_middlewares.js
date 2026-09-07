import assert from 'assert';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

// 1. Config imports
import { env } from '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { ROLES, ORDER_STATUS, PAYMENT_STATUS, PRODUCT_STATUS } from '../src/config/constants.js';
import { logger } from '../src/config/logger.js';

// 2. Middleware imports
import { requireAuth, optionalAuth, requireRole } from '../src/middlewares/auth.middleware.js';
import { validate } from '../src/middlewares/validate.middleware.js';
import { errorHandler, notFoundHandler } from '../src/middlewares/error.middleware.js';
import { apiLimiter, authLimiter } from '../src/middlewares/rateLimiter.middleware.js';

// 3. User model for test token generation
import { User } from '../src/models/user.model.js';

const BACKEND_URL = `http://localhost:${env.PORT || 5000}`;

async function runVerification() {
  console.log('============================================================');
  console.log('🧪 CONFIG FILES & MIDDLEWARES VERIFICATION SUITE');
  console.log(`Target Backend: ${BACKEND_URL}`);
  console.log('============================================================\n');

  let passed = 0;
  let total = 0;

  function test(description, fn) {
    total++;
    try {
      fn();
      console.log(`✅ [PASS] ${description}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${description}`);
      console.error(`   Error: ${err.message}`);
    }
  }

  async function testAsync(description, fn) {
    total++;
    try {
      await fn();
      console.log(`✅ [PASS] ${description}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${description}`);
      console.error(`   Error: ${err.message}`);
    }
  }

  // -------------------------------------------------------------
  // PART 1: CONFIG FILES VERIFICATION
  // -------------------------------------------------------------
  console.log('--- SECTION 1: Config Files Integrity ---');

  test('config/env.js: Object is frozen and exports valid configuration', () => {
    assert(Object.isFrozen(env), 'env object must be frozen');
    assert(typeof env.PORT === 'number' && env.PORT > 0, 'env.PORT must be a valid number');
    assert(typeof env.MONGODB_URI === 'string' && env.MONGODB_URI.startsWith('mongodb'), 'env.MONGODB_URI must be a mongodb URI');
    assert(typeof env.JWT?.SECRET === 'string' && env.JWT.SECRET.length >= 8, 'env.JWT.SECRET must be defined and secure');
    assert(typeof env.CLIENT_URL === 'string', 'env.CLIENT_URL must be defined');
    assert(typeof env.RATE_LIMIT?.MAX === 'number', 'env.RATE_LIMIT.MAX must be a number');
  });

  test('config/constants.js: Enums are frozen and define required domain constants', () => {
    assert(Object.isFrozen(ROLES), 'ROLES must be frozen');
    assert(ROLES.USER === 'user' && ROLES.ADMIN === 'admin' && ROLES.OPERATIONS === 'operations', 'ROLES values match spec');
    assert(Object.isFrozen(ORDER_STATUS), 'ORDER_STATUS must be frozen');
    assert(ORDER_STATUS.DELIVERED === 'delivered' && ORDER_STATUS.CANCELLED === 'cancelled' && ORDER_STATUS.RETURN_REQUESTED === 'return_requested', 'ORDER_STATUS values match spec');
    assert(Object.isFrozen(PAYMENT_STATUS), 'PAYMENT_STATUS must be frozen');
    assert(PAYMENT_STATUS.CAPTURED === 'captured' && PAYMENT_STATUS.PENDING === 'pending', 'PAYMENT_STATUS values match spec');
    assert(Object.isFrozen(PRODUCT_STATUS), 'PRODUCT_STATUS must be frozen');
  });

  test('config/logger.js: Logger exports structured logging methods', () => {
    assert(typeof logger.info === 'function', 'logger.info exists');
    assert(typeof logger.warn === 'function', 'logger.warn exists');
    assert(typeof logger.error === 'function', 'logger.error exists');
    assert(typeof logger.http === 'function', 'logger.http exists');
  });

  await testAsync('config/db.js: Database connects and reports active connection state', async () => {
    await connectDB();
    assert(mongoose.connection.readyState === 1, 'Mongoose connection readyState must be 1 (connected)');
    assert(mongoose.connection.name === 'avn_fitness', 'Connected to correct database avn_fitness');
  });

  // -------------------------------------------------------------
  // PART 2: LIVE MIDDLEWARES INTERCEPTION VERIFICATION
  // -------------------------------------------------------------
  console.log('\n--- SECTION 2: Live Middlewares Interception & Protection ---');

  // Create a temporary test user for auth middleware verification
  const testEmail = `middleware_verify_${Date.now()}@test.com`;
  let testUser = await User.findOne({ email: testEmail });
  if (!testUser) {
    testUser = await User.create({
      name: 'Middleware Verification User',
      email: testEmail,
      phone: '9876543299',
      role: ROLES.USER,
      isActive: true,
      authProvider: 'local',
      password: 'TestPassword123!',
    });
  }

  const validToken = jwt.sign(
    { id: testUser._id.toString(), email: testUser.email, role: testUser.role },
    env.JWT.SECRET,
    { expiresIn: '1h' }
  );

  await testAsync('auth.middleware.js (requireAuth): Blocks unauthenticated requests with 401', async () => {
    const res = await fetch(`${BACKEND_URL}/api/v1/orders`);
    const data = await res.json();
    assert.strictEqual(res.status, 401, 'Response status must be 401');
    assert.strictEqual(data.success, false, 'data.success must be false');
    assert(data.message.includes('Authentication token required'), 'Message indicates token required');
  });

  await testAsync('auth.middleware.js (requireAuth): Rejects bogus or corrupted token with 401', async () => {
    const res = await fetch(`${BACKEND_URL}/api/v1/orders`, {
      headers: { Authorization: 'Bearer invalid_bogus_token_12345' },
    });
    const data = await res.json();
    assert.strictEqual(res.status, 401, 'Response status must be 401');
    assert(data.message.toLowerCase().includes('token'), 'Rejects corrupted token');
  });

  await testAsync('auth.middleware.js (requireAuth): Authorizes valid JWT and attaches user', async () => {
    const res = await fetch(`${BACKEND_URL}/api/v1/orders`, {
      headers: { Authorization: `Bearer ${validToken}` },
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200, 'Response status must be 200');
    assert.strictEqual(data.success, true, 'data.success must be true');
    assert(Array.isArray(data.data?.orders), 'Successfully returned user orders list');
  });

  await testAsync('auth.middleware.js (optionalAuth): Seamlessly handles anonymous guest access', async () => {
    const res = await fetch(`${BACKEND_URL}/api/v1/cart`, {
      headers: { 'x-guest-id': 'test-guest-session-123' },
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200, 'optionalAuth allows guest cart with status 200');
    assert(data.success, 'Guest cart response is successful');
  });

  await testAsync('auth.middleware.js (requireRole): Enforces role boundary and rejects regular user from admin routes with 403', async () => {
    const res = await fetch(`${BACKEND_URL}/api/v1/admin/analytics`, {
      headers: { Authorization: `Bearer ${validToken}` },
    });
    const data = await res.json();
    assert.strictEqual(res.status, 403, 'Regular user rejected from admin route with 403 Forbidden');
    assert.strictEqual(data.success, false, 'data.success is false');
  });

  await testAsync('validate.middleware.js: Intercepts malformed payloads with 422 Unprocessable before hitting controller', async () => {
    // Attempt login with invalid email syntax
    const res = await fetch(`${BACKEND_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-a-valid-email', password: '123' }),
    });
    const data = await res.json();
    assert.strictEqual(res.status, 422, 'Schema validation failure returns status 422 Unprocessable Entity');
    assert.strictEqual(data.success, false, 'Validation rejected');
    assert(Array.isArray(data.errors) && data.errors.length > 0, 'Returns structured Zod validation error issues');
  });

  await testAsync('error.middleware.js (notFoundHandler): Catches non-existent routes and formats uniform 404 JSON', async () => {
    const res = await fetch(`${BACKEND_URL}/api/v1/route-that-does-not-exist-${Date.now()}`);
    const data = await res.json();
    assert.strictEqual(res.status, 404, 'Response status must be 404');
    assert.strictEqual(data.success, false, 'data.success must be false');
    assert(data.message.includes('not found') || data.message.includes('Not Found'), 'Uniform 404 error message');
  });

  await testAsync('Security Middlewares (Helmet & CORS): Response headers enforce security policies', async () => {
    const res = await fetch(`${BACKEND_URL}/health`);
    // Helmet sets X-Content-Type-Options: nosniff
    const nosniff = res.headers.get('x-content-type-options');
    assert.strictEqual(nosniff, 'nosniff', 'Helmet middleware sets X-Content-Type-Options: nosniff');
  });

  // Cleanup test user
  await User.deleteOne({ _id: testUser._id });
  await disconnectDB();

  console.log('\n============================================================');
  console.log(`VERIFICATION SUMMARY: ${passed}/${total} TESTS PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log('============================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('Verification failed unexpectedly:', err);
  process.exit(1);
});
