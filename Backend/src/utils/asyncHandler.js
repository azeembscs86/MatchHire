'use strict';

/**
 * asyncHandler
 * ------------
 * Wraps an async route handler so any thrown error (or rejected promise) is
 * forwarded to Express's `next()` and handled by the centralised error
 * middleware. Saves a try/catch in every controller.
 */

module.exports = function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
