import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env
dotenv.config();

export const env = Object.freeze({
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5000', 10),
  API_PREFIX: process.env.API_PREFIX || '/api/v1',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/avn_fitness',
  
  JWT: {
    SECRET: process.env.JWT_SECRET || 'super_secret_jwt_key_fitness_gear_2026_dev_mode',
    EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
    COOKIE_EXPIRES_DAYS: parseInt(process.env.JWT_COOKIE_EXPIRES_DAYS || '7', 10),
  },

  COOKIE_SECRET: process.env.COOKIE_SECRET || 'super_secret_cookie_parser_key_2026',

  RATE_LIMIT: {
    WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 mins
    MAX: parseInt(process.env.RATE_LIMIT_MAX || '100', 10), // requests per window
  },

  PAYMENT: {
    PROVIDER: process.env.PAYMENT_PROVIDER || 'razorpay',
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || '',
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || '',
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
  },

  MEDIA: {
    PROVIDER: process.env.MEDIA_STORAGE_PROVIDER || 'cloudinary',
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '',
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '',
  }
});
