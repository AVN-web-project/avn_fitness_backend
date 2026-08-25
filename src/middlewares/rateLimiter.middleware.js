import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';

/**
 * Standard API rate limiter
 */
export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT.WINDOW_MS,
  max: env.RATE_LIMIT.MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    next(ApiError.badRequest('Too many requests from this IP. Please try again later.'));
  },
});

/**
 * Strict rate limiter for sensitive authentication endpoints (login, register, forgot password)
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    next(ApiError.badRequest('Too many authentication attempts. Please try again in 15 minutes.'));
  },
});
