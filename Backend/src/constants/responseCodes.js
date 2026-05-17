'use strict';

module.exports = {
  SUCCESS: 1,
  FAILURE: 0,
  STATUS: {
    SUCCESS: 'Success',
    ERROR: 'Error',
    VALIDATION_ERROR: 'Validation Error',
  },
  HTTP: {
    OK: 200,
    CREATED: 201,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    UNPROCESSABLE: 422,
    TOO_MANY: 429,
    SERVER_ERROR: 500,
  },
};
