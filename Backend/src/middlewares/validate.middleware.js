'use strict';

/**
 * Joi validation middleware
 * -------------------------
 * `validate(schema, target = 'body')` runs the given Joi schema against
 * `req[target]` ('body' | 'query' | 'params'), strips unknown keys, and:
 *
 *   - on success, replaces `req[target]` with the typed/coerced value so the
 *     controller sees the cleaned payload
 *   - on failure, returns the canonical validation envelope (`Errors: [...]`)
 *
 * Joi default values are applied during validation, which is why list
 * endpoints can omit `page`/`limit` from the request.
 */

const response = require('../utils/response.helper');

const VALID_TARGETS = ['body', 'query', 'params'];

function formatJoiError(error) {
  return (error.details || []).map((d) => ({
    field: d.path?.join('.') || d.context?.key || 'unknown',
    message: d.message.replace(/"/g, ''),
    type: d.type,
  }));
}

function validate(schema, target = 'body') {
  if (!VALID_TARGETS.includes(target)) throw new Error(`Invalid validate target: ${target}`);
  return function (req, res, next) {
    if (!schema || typeof schema.validate !== 'function') return next();
    const { value, error } = schema.validate(req[target], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });
    if (error) return response.validationError(res, formatJoiError(error));
    req[target] = value;
    return next();
  };
}

module.exports = validate;
