'use strict';

/**
 * Geolocation service
 * -------------------
 * Server-side proxy in front of ipapi.co's free tier. The frontend
 * never calls ipapi directly, so the visitor's IP is not leaked to a
 * third party from the browser and we can swap providers (MaxMind,
 * IPinfo, etc.) without changing the frontend.
 *
 * Returns a normalised, small payload:
 *
 *   { ip, country, country_code, city, region, timezone, latitude, longitude }
 *
 * Cached briefly by IP so repeated requests from the same client are
 * cheap. Caches transparently no-op when Redis is offline.
 */

const cache = require('../cache/cache.helper');
const logger = require('../utils/logger');

const IPAPI_BASE = 'https://ipapi.co';
const TTL_SECONDS = 60 * 60; // an hour

function pickIp(req) {
  // Order: X-Forwarded-For first value, then req.ip, then connection.
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) {
    const first = String(fwd).split(',')[0].trim();
    if (first && !isLocal(first)) return first;
  }
  if (req.ip && !isLocal(req.ip)) return req.ip;
  return null;
}

function isLocal(ip) {
  return !ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.');
}

async function lookup(ipOrReq) {
  const ip = typeof ipOrReq === 'string' ? ipOrReq : pickIp(ipOrReq);
  if (!ip) {
    // Local dev fallback - return null so the frontend prompts the
    // user to pick a country/city manually.
    return { ip: null, country: null, country_code: null, city: null, region: null, timezone: null, latitude: null, longitude: null };
  }

  const cacheKey = `geo:ip:${ip}`;
  const hit = await cache.getCache(cacheKey);
  if (hit) return hit;

  try {
    const res = await fetch(`${IPAPI_BASE}/${encodeURIComponent(ip)}/json/`, {
      headers: { 'User-Agent': 'MatchHire/1.0' },
      // 4-second timeout via AbortController
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`ipapi ${res.status}`);
    const j = await res.json();
    if (j.error) throw new Error(j.reason || 'ipapi error');
    const payload = {
      ip,
      country: j.country_name || null,
      country_code: j.country_code || null,
      city: j.city || null,
      region: j.region || null,
      timezone: j.timezone || null,
      latitude: j.latitude ?? null,
      longitude: j.longitude ?? null,
    };
    await cache.setCache(cacheKey, payload, TTL_SECONDS);
    return payload;
  } catch (err) {
    logger.warn('geolocation lookup failed', { ip, error: err.message });
    return { ip, country: null, country_code: null, city: null, region: null, timezone: null, latitude: null, longitude: null };
  }
}

module.exports = { lookup, pickIp };
