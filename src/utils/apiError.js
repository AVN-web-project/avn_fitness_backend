/**
 * Custom Operational API Error Class
 */
export class ApiError extends Error {
  constructor(statusCode, message = 'Something went wrong', errors = [], stack = '') {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.errors = errors;

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static badRequest(msg, errors = []) {
    return new ApiError(400, msg, errors);
  }

  static unauthorized(msg = 'Authentication required') {
    return new ApiError(401, msg);
  }

  static forbidden(msg = 'Access denied: insufficient permissions') {
    return new ApiError(403, msg);
  }

  static notFound(msg = 'Resource not found') {
    return new ApiError(404, msg);
  }

  static conflict(msg = 'Resource already exists') {
    return new ApiError(409, msg);
  }

  static unprocessable(msg = 'Validation failed', errors = []) {
    return new ApiError(422, msg, errors);
  }

  static internal(msg = 'Internal Server Error') {
    return new ApiError(500, msg);
  }
}
