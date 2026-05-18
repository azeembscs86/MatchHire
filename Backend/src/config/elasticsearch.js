'use strict';

/**
 * ElasticSearch client manager
 * ----------------------------
 * Single shared `@elastic/elasticsearch` client. Designed so the
 * server can boot even when ES is unreachable - every consumer asks
 * `isReady()` and falls back to MySQL when it's false.
 *
 * Index names are prefixed via ELASTICSEARCH_INDEX_PREFIX so
 * multiple environments can share one cluster:
 *
 *   matchhire_jobs       canonical job index
 *   matchhire_candidates public candidate index
 *   matchhire_resumes    private resume index (parsed payloads)
 *
 * Index settings:
 *   - 1 shard / 0 replicas in dev; bump for prod via overrides
 *   - English analyzer + an `autocomplete` edge-ngram analyzer for
 *     skill / company / role suggestions
 *
 * `ensureIndices()` is idempotent: it creates each index if missing
 * with the proper mapping, otherwise leaves them alone. Reindexers
 * call this on demand.
 */

const { Client } = require('@elastic/elasticsearch');
const config = require('./env');
const logger = require('../utils/logger');

const NODE = process.env.ELASTICSEARCH_NODE || 'http://localhost:9200';
const USERNAME = process.env.ELASTICSEARCH_USERNAME || null;
const PASSWORD = process.env.ELASTICSEARCH_PASSWORD || null;
const PREFIX = process.env.ELASTICSEARCH_INDEX_PREFIX || 'matchhire';

const INDEX = {
  jobs:       `${PREFIX}_jobs`,
  candidates: `${PREFIX}_candidates`,
  resumes:    `${PREFIX}_resumes`,
};

let client = null;
let connected = false;
let disabled = false;

function buildClient() {
  const opts = {
    node: NODE,
    requestTimeout: 5000,
    maxRetries: 1,
  };
  if (USERNAME && PASSWORD) opts.auth = { username: USERNAME, password: PASSWORD };
  return new Client(opts);
}

async function init() {
  if (disabled) return null;
  if (!client) client = buildClient();
  try {
    const info = await client.info();
    connected = true;
    logger.info(`ElasticSearch connected (${info?.version?.number || 'unknown'})`);
    await ensureIndices();
    return client;
  } catch (err) {
    connected = false;
    logger.warn(`ElasticSearch unreachable - search falls back to MySQL`, { node: NODE, error: err.message });
    return null;
  }
}

function isReady() { return !!client && connected && !disabled; }
function getClient() { return client; }

const COMMON_SETTINGS = {
  number_of_shards: 1,
  number_of_replicas: 0,
  analysis: {
    analyzer: {
      english_standard: { type: 'standard' },
      autocomplete: {
        type: 'custom', tokenizer: 'autocomplete_tokenizer', filter: ['lowercase'],
      },
      autocomplete_search: {
        type: 'custom', tokenizer: 'lowercase',
      },
    },
    tokenizer: {
      autocomplete_tokenizer: {
        type: 'edge_ngram', min_gram: 1, max_gram: 12,
        token_chars: ['letter', 'digit'],
      },
    },
  },
};

const JOB_MAPPING = {
  properties: {
    id:                 { type: 'long' },
    title:              { type: 'text', fields: { keyword: { type: 'keyword' }, autocomplete: { type: 'text', analyzer: 'autocomplete', search_analyzer: 'autocomplete_search' } } },
    description:        { type: 'text' },
    responsibilities:   { type: 'text' },
    requirements:       { type: 'text' },
    skills_tags:        { type: 'keyword' },
    skills_text:        { type: 'text', analyzer: 'english_standard' },
    company_name:       { type: 'text', fields: { keyword: { type: 'keyword' }, autocomplete: { type: 'text', analyzer: 'autocomplete', search_analyzer: 'autocomplete_search' } } },
    company_id:         { type: 'long' },
    company_logo:       { type: 'keyword', index: false },
    category_name:      { type: 'keyword' },
    category_slug:      { type: 'keyword' },
    job_type:           { type: 'keyword' },
    experience_level:   { type: 'keyword' },
    work_mode:          { type: 'keyword' },
    is_remote:          { type: 'boolean' },
    is_global_remote:   { type: 'boolean' },
    city:               { type: 'keyword' },
    country:            { type: 'keyword' },
    timezone:           { type: 'keyword' },
    salary_min:         { type: 'long' },
    salary_max:         { type: 'long' },
    salary_currency:    { type: 'keyword' },
    salary_period:      { type: 'keyword' },
    is_featured:        { type: 'boolean' },
    status:             { type: 'keyword' },
    published_at:       { type: 'date' },
    created_at:         { type: 'date' },
    location:           { type: 'geo_point' },
  },
};

const CANDIDATE_MAPPING = {
  properties: {
    id:                 { type: 'long' },
    full_name:          { type: 'text', fields: { keyword: { type: 'keyword' } } },
    headline:           { type: 'text', fields: { autocomplete: { type: 'text', analyzer: 'autocomplete', search_analyzer: 'autocomplete_search' } } },
    summary:            { type: 'text' },
    current_title:      { type: 'text', fields: { keyword: { type: 'keyword' } } },
    years_experience:   { type: 'float' },
    skills:             { type: 'keyword' },
    skills_text:        { type: 'text' },
    city:               { type: 'keyword' },
    country:            { type: 'keyword' },
    timezone:           { type: 'keyword' },
    open_to_remote:     { type: 'boolean' },
    expected_salary_min:{ type: 'long' },
    expected_salary_max:{ type: 'long' },
    salary_currency:    { type: 'keyword' },
    availability:       { type: 'keyword' },
    profile_strength:   { type: 'integer' },
    languages:          { type: 'keyword' },
    is_public:          { type: 'boolean' },
    updated_at:         { type: 'date' },
  },
};

const RESUME_MAPPING = {
  properties: {
    id:                 { type: 'long' },
    candidate_user_id:  { type: 'long' },
    full_name:          { type: 'text', fields: { keyword: { type: 'keyword' } } },
    email:              { type: 'keyword' },
    job_title:          { type: 'text', fields: { keyword: { type: 'keyword' } } },
    summary:            { type: 'text' },
    skills:             { type: 'keyword' },
    experience_text:    { type: 'text' },
    education_text:     { type: 'text' },
    city:               { type: 'keyword' },
    country:            { type: 'keyword' },
    confidence:         { type: 'float' },
    parse_status:       { type: 'keyword' },
    uploaded_at:        { type: 'date' },
  },
};

async function ensureIndex(name, mapping) {
  if (!isReady()) return false;
  try {
    const exists = await client.indices.exists({ index: name });
    if (exists) return true;
    await client.indices.create({
      index: name,
      settings: COMMON_SETTINGS,
      mappings: mapping,
    });
    logger.info(`ElasticSearch index created: ${name}`);
    return true;
  } catch (err) {
    logger.warn(`ensureIndex ${name} failed`, { error: err.message });
    return false;
  }
}

async function ensureIndices() {
  if (!isReady()) return;
  await ensureIndex(INDEX.jobs, JOB_MAPPING);
  await ensureIndex(INDEX.candidates, CANDIDATE_MAPPING);
  await ensureIndex(INDEX.resumes, RESUME_MAPPING);
}

async function dropIndex(name) {
  if (!isReady()) return false;
  try {
    const exists = await client.indices.exists({ index: name });
    if (exists) await client.indices.delete({ index: name });
    return true;
  } catch (err) {
    logger.warn(`dropIndex ${name} failed`, { error: err.message });
    return false;
  }
}

function disable() {
  disabled = true;
  if (client) { try { client.close(); } catch (_) { /* noop */ } }
}

async function close() {
  if (client) {
    try { await client.close(); } catch (_) { /* noop */ }
    client = null;
    connected = false;
  }
}

module.exports = {
  init,
  isReady,
  getClient,
  ensureIndices,
  ensureIndex,
  dropIndex,
  disable,
  close,
  INDEX,
  MAPPINGS: { jobs: JOB_MAPPING, candidates: CANDIDATE_MAPPING, resumes: RESUME_MAPPING },
};
