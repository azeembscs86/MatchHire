'use strict';

/**
 * Pagination helpers
 * ------------------
 * `parsePagination(query)`  - safe page/limit parsing with caps
 * `buildPagination(...)`    - returns the metadata block included on every list
 *
 * `MAX_LIMIT` (100) is the hard ceiling on `limit` to keep queries bounded.
 */

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

function parsePagination(query = {}) {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function buildPagination(page, limit, total) {
  const safeLimit = limit > 0 ? limit : DEFAULT_LIMIT;
  const totalPages = total > 0 ? Math.ceil(total / safeLimit) : 0;
  return { page, limit: safeLimit, total, totalPages };
}

module.exports = {
  parsePagination,
  buildPagination,
  DEFAULT_LIMIT,
  MAX_LIMIT,
};
