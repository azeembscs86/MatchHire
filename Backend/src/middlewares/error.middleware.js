'use strict';

/**
 * Centralised error handling
 * --------------------------
 * `notFoundHandler` - terminal middleware that converts unmatched routes
 *                     into the standard 404 envelope.
 * `errorHandler`    - final Express error middleware.
 *
 *   - Operational `AppError`s are surfaced as-is (with their statusCode).
 *   - MySQL duplicate-key errors -> 409 Conflict
 *   - MySQL FK errors            -> 400 Bad Request
 *   - JWT errors                 -> 401 Unauthorized
 *   - Everything else            -> 500 (logged with stack, masked message)
 */

const response = require('../utils/response.helper');
const logger = require('../utils/logger');
const AppError = require('../utils/AppError');

function notFoundHandler(req, res, _next) {
  return response.notFound(res, `Route not found: ${req.method} ${req.originalUrl}`);
}

function errorHandler(err, req, res, _next) {
  const isOperational = err instanceof AppError || err.isOperational;
  const status = err.statusCode || err.status || 500;

  if (err.code === 'ER_DUP_ENTRY') {
    return response.conflict(res, 'Resource already exists');
  }
  if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_ROW_IS_REFERENCED_2') {
    return response.error(res, 'Invalid reference between records', 400);
  }
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return response.unauthorized(res, 'Invalid or expired token');
  }

  if (status >= 500) {
    logger.error('Unhandled error', { message: err.message, stack: err.stack, url: req.originalUrl });
  } else {
    logger.warn('Operational error', { message: err.message, url: req.originalUrl });
  }

  const message = isOperational ? err.message : 'Internal server error';
  return response.error(res, message, status, err.details || null);
}

module.exports = { notFoundHandler, errorHandler };
