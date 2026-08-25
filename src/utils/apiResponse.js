/**
 * Standardized API Response Envelope
 */
export class ApiResponse {
  constructor(statusCode, data = null, message = 'Success', meta = null) {
    this.success = statusCode < 400;
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
    if (meta) {
      this.meta = meta;
    }
  }

  static success(res, data, message = 'Success', statusCode = 200, meta = null) {
    return res.status(statusCode).json(new ApiResponse(statusCode, data, message, meta));
  }

  static created(res, data, message = 'Resource created successfully') {
    return res.status(201).json(new ApiResponse(201, data, message));
  }

  static noContent(res) {
    return res.status(204).send();
  }
}
