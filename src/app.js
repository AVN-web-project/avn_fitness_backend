import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';

import { env } from './config/env.js';
import { apiLimiter } from './middlewares/rateLimiter.middleware.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';

// Route imports
import healthRoutes from './modules/health/health.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import categoryRoutes from './modules/categories/categories.routes.js';
import productRoutes from './modules/products/products.routes.js';
import cartRoutes from './modules/cart/cart.routes.js';
import checkoutRoutes from './modules/checkout/checkout.routes.js';
import orderRoutes from './modules/orders/orders.routes.js';
import operationsRoutes from './modules/operations/operations.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import couponRoutes from './modules/coupons/coupons.routes.js';
import reviewRoutes from './modules/reviews/reviews.routes.js';
import supportRoutes from './modules/support/support.routes.js';

const app = express();

// Security HTTP headers
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-guest-id'],
  })
);

// Request parsing & compression
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser(env.COOKIE_SECRET));
app.use(compression());

// HTTP Request logging
if (env.NODE_ENV !== 'test') {
  app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));
}

// Rate limiting on API routes
app.use('/api', apiLimiter);

// Root Health endpoints
app.use('/health', healthRoutes);
app.use(`${env.API_PREFIX}/health`, healthRoutes);

// Feature Module routes
app.use(`${env.API_PREFIX}/auth`, authRoutes);
app.use(`${env.API_PREFIX}/categories`, categoryRoutes);
app.use(`${env.API_PREFIX}/products`, productRoutes);
app.use(`${env.API_PREFIX}/cart`, cartRoutes);
app.use(`${env.API_PREFIX}/checkout`, checkoutRoutes);
app.use(`${env.API_PREFIX}/orders`, orderRoutes);
app.use(`${env.API_PREFIX}/operations`, operationsRoutes);
app.use(`${env.API_PREFIX}/admin`, adminRoutes);
app.use(`${env.API_PREFIX}/coupons`, couponRoutes);
app.use(`${env.API_PREFIX}/reviews`, reviewRoutes);
app.use(`${env.API_PREFIX}/support`, supportRoutes);

// Catch 404 & Central error handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
