'use strict';

/**
 * AppError
 * --------
 * Operational error class. Throw from services to signal an expected
 * failure with a specific HTTP status (`new AppError('Job not found', 404)`).
 * The centralised error handler in `middlewares/error.middleware.js` knows
 * to surface `isOperational` errors verbatim while masking unexpected ones.
 */

class AppError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

module.exports = AppError;
