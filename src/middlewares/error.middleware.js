import { ApiError } from '../utils/apiError.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * 404 Route Not Found Handler
 */
export const notFoundHandler = (req, res, next) => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

/**
 * Centralized Application Error Middleware
 */
export const errorHandler = (err, req, res, next) => {
  let error = err;

  // Handle Mongoose Validation Error
  if (err.name === 'ValidationError') {
    const message = 'Validation Error';
    const errors = Object.values(err.errors).map((val) => ({
      field: val.path,
      message: val.message,
    }));
    error = ApiError.unprocessable(message, errors);
  }

  // Handle Mongoose Duplicate Key Error (code 11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `Duplicate value entered for '${field}'. Please use another value.`;
    error = ApiError.conflict(message);
  }

  // Handle Mongoose Invalid ObjectId (CastError)
  if (err.name === 'CastError') {
    const message = `Invalid format for resource ID: ${err.value}`;
    error = ApiError.badRequest(message);
  }

  // Handle JSON Web Token Errors
  if (err.name === 'JsonWebTokenError') {
    error = ApiError.unauthorized('Invalid authentication token');
  }

  if (err.name === 'TokenExpiredError') {
    error = ApiError.unauthorized('Authentication token has expired');
  }

  // Fallback to internal error if not an ApiError instance
  if (!(error instanceof ApiError)) {
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal Server Error';
    error = new ApiError(statusCode, message, [], err.stack);
  }

  // Log error details for 5xx errors or in development
  if (error.statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} - ${error.message}`, {
      stack: error.stack,
      body: req.body,
    });
  }

  const responsePayload = {
    success: false,
    statusCode: error.statusCode,
    status: error.status,
    message: error.message,
    errors: error.errors && error.errors.length ? error.errors : undefined,
    ...(env.NODE_ENV === 'development' && { stack: error.stack }),
  };

  res.status(error.statusCode).json(responsePayload);
};
