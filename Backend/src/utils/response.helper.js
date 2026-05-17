'use strict';

/**
 * Response helper
 * ---------------
 * Every API response goes through one of these helpers, guaranteeing the
 * MatchHire envelope:
 *
 *   success / created / list   -> { Response: {responseCode: 1, ...}, Data }
 *   error / unauthorized / ... -> { Response: {responseCode: 0, ...}, Data: null }
 *   validationError            -> { Response: {responseCode: 0, status: "Validation Error"}, Errors }
 *
 * Controllers MUST use these helpers - never `res.json(...)` directly.
 */

const { SUCCESS, FAILURE, STATUS, HTTP } = require('../constants/responseCodes');

function buildResponse(responseCode, status, message) {
  return { responseCode, status, message };
}

function success(res, data = {}, message = 'Data Returned Successfully', httpStatus = HTTP.OK) {
  return res.status(httpStatus).json({
    Response: buildResponse(SUCCESS, STATUS.SUCCESS, message),
    Data: data == null ? {} : data,
  });
}

function created(res, data = {}, message = 'Resource Created Successfully') {
  return success(res, data, message, HTTP.CREATED);
}

function list(res, records, pagination, message = 'Records Returned Successfully') {
  return res.status(HTTP.OK).json({
    Response: buildResponse(SUCCESS, STATUS.SUCCESS, message),
    Data: { records: records || [], pagination: pagination || null },
  });
}

function error(res, message = 'Something went wrong', httpStatus = HTTP.BAD_REQUEST, data = null) {
  return res.status(httpStatus).json({
    Response: buildResponse(FAILURE, STATUS.ERROR, message),
    Data: data,
  });
}

function validationError(res, errors = [], message = 'Invalid request data') {
  return res.status(HTTP.UNPROCESSABLE).json({
    Response: buildResponse(FAILURE, STATUS.VALIDATION_ERROR, message),
    Errors: Array.isArray(errors) ? errors : [errors],
  });
}

function unauthorized(res, message = 'Unauthorized') {
  return error(res, message, HTTP.UNAUTHORIZED);
}

function forbidden(res, message = 'Forbidden') {
  return error(res, message, HTTP.FORBIDDEN);
}

function notFound(res, message = 'Resource not found') {
  return error(res, message, HTTP.NOT_FOUND);
}

function conflict(res, message = 'Resource conflict') {
  return error(res, message, HTTP.CONFLICT);
}

function serverError(res, message = 'Internal server error') {
  return error(res, message, HTTP.SERVER_ERROR);
}

module.exports = {
  success,
  created,
  list,
  error,
  validationError,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  serverError,
};
