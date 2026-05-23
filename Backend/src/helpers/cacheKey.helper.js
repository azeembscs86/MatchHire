'use strict';

/**
 * Centralised cache key + invalidation pattern builders.
 *
 * Every consumer of Redis caching - cache.service, match.service,
 * search.service, trending.service - reads its keys from here so the
 * naming stays consistent and invalidation is trivially complete
 * (delete-by-pattern).
 *
 * Key shape (all lower-case, colon separated):
 *
 *   mh:<domain>:<scope>:<id-or-query>
 *
 *   mh:job:list:<hash>             paginated job listing
 *   mh:job:feed:<userId>:<hash>    personalised feed
 *   mh:job:detail:<id>             job detail
 *   mh:job:trending:<scope>        trending list (city, country, global)
 *   mh:company:list:<hash>         company list
 *   mh:company:detail:<id>         company detail
 *   mh:candidate:detail:<id>       public candidate
 *   mh:meta:countries              ref data
 *   mh:meta:cities:<countryId>
 *   mh:meta:skills:all             skills lookup
 *   mh:match:<candidateId>:<jobId> per-pair match score
 *   mh:search:<index>:<hash>       generic search-result cache
 *   mh:session:<userId>:<sessionId>
 *
 * Hashing: the `hash(...)` helper produces a stable, short hash of an
 * object so cache keys do not balloon. Order of object keys is
 * normalised so `{a:1,b:2}` and `{b:2,a:1}` share the same key.
 */

const crypto = require('node:crypto');

/*
 * `mh-v2` — bumped Nov 2026 when candidate-facing job lists started
 * filtering expired postings server-side. The version is part of every
 * cache key so previously-cached payloads (which still contained
 * expired roles) miss and rebuild against the new filters. Bump again
 * the next time a query change would make old cache entries wrong.
 */
const PREFIX = 'mh-v2';

function normalise(obj) {
  if (obj == null) return '';
  if (typeof obj !== 'object') return String(obj);
  const sorted = Object.keys(obj)
    .filter((k) => obj[k] !== undefined && obj[k] !== null && obj[k] !== '')
    .sort()
    .map((k) => `${k}=${typeof obj[k] === 'object' ? JSON.stringify(obj[k]) : obj[k]}`)
    .join('&');
  return sorted;
}

function hash(input, length = 12) {
  const value = typeof input === 'string' ? input : normalise(input);
  if (!value) return 'all';
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, length);
}

const Keys = {
  // --- jobs ---
  jobList(filters)          { return `${PREFIX}:job:list:${hash(filters)}`; },
  jobFeed(userId, filters)  { return `${PREFIX}:job:feed:${userId}:${hash(filters)}`; },
  jobDetail(id)             { return `${PREFIX}:job:detail:${id}`; },
  jobsTrending(scope)       { return `${PREFIX}:job:trending:${scope || 'global'}`; },

  // --- companies ---
  companyList(filters)      { return `${PREFIX}:company:list:${hash(filters)}`; },
  companyDetail(id)         { return `${PREFIX}:company:detail:${id}`; },

  // --- candidates ---
  candidateList(filters)    { return `${PREFIX}:candidate:list:${hash(filters)}`; },
  candidateDetail(id)       { return `${PREFIX}:candidate:detail:${id}`; },
  topCandidates()           { return `${PREFIX}:candidate:top`; },

  // --- meta / reference data ---
  countries()               { return `${PREFIX}:meta:countries`; },
  cities(countryId = 'all') { return `${PREFIX}:meta:cities:${countryId}`; },
  skillsAll()               { return `${PREFIX}:meta:skills:all`; },
  categories()              { return `${PREFIX}:meta:categories`; },

  // --- match scoring ---
  matchScore(candidateId, jobId) { return `${PREFIX}:match:${candidateId}:${jobId}`; },

  // --- search ---
  search(index, query)      { return `${PREFIX}:search:${index}:${hash(query)}`; },

  // --- sessions ---
  session(userId, sessionId) { return `${PREFIX}:session:${userId}:${sessionId}`; },
  sessionIndex(userId)       { return `${PREFIX}:session-idx:${userId}`; },

  // --- dashboards ---
  dashboardStats(scope, id = 'all') { return `${PREFIX}:dashboard:${scope}:${id}`; },
};

const Patterns = {
  allJobs:           `${PREFIX}:job:*`,
  jobLists:          `${PREFIX}:job:list:*`,
  jobFeeds:          `${PREFIX}:job:feed:*`,
  jobFeedsForUser:   (userId) => `${PREFIX}:job:feed:${userId}:*`,
  jobDetail:         (id) => `${PREFIX}:job:detail:${id}`,
  jobsTrending:      `${PREFIX}:job:trending:*`,

  allCompanies:      `${PREFIX}:company:*`,
  companyLists:      `${PREFIX}:company:list:*`,
  companyDetail:     (id) => `${PREFIX}:company:detail:${id}`,

  allCandidates:     `${PREFIX}:candidate:*`,
  candidateLists:    `${PREFIX}:candidate:list:*`,
  candidateDetail:   (id) => `${PREFIX}:candidate:detail:${id}`,

  matchForCandidate: (candidateId) => `${PREFIX}:match:${candidateId}:*`,
  matchForJob:       (jobId) => `${PREFIX}:match:*:${jobId}`,
  allMatches:        `${PREFIX}:match:*`,

  searchAll:         `${PREFIX}:search:*`,
  searchByIndex:     (index) => `${PREFIX}:search:${index}:*`,

  sessionsForUser:   (userId) => `${PREFIX}:session:${userId}:*`,

  dashboard:         (scope) => `${PREFIX}:dashboard:${scope}:*`,
};

/**
 * TTLs (seconds). Centralised so the strategy doc and the code stay
 * in sync. Tweak here, the whole app picks up the new value.
 */
const TTL = Object.freeze({
  JOB_LIST: 10 * 60,
  JOB_FEED: 5 * 60,
  JOB_DETAIL: 15 * 60,
  JOBS_TRENDING: 30 * 60,
  COMPANY_LIST: 30 * 60,
  COMPANY_DETAIL: 30 * 60,
  CANDIDATE_LIST: 10 * 60,
  CANDIDATE_DETAIL: 10 * 60,
  TOP_CANDIDATES: 10 * 60,
  META: 60 * 60,
  MATCH_SCORE: 30 * 60,
  SEARCH_RESULT: 5 * 60,
  SESSION: 30 * 24 * 3600,   // 30 days; mirrors the refresh-token lifetime
  DASHBOARD: 5 * 60,
});

module.exports = { Keys, Patterns, TTL, hash, PREFIX };
