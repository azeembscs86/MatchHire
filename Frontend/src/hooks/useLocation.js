/**
 * useLocation
 *
 * Resolves the visitor's location with the following order of fallbacks:
 *
 *   1. Stored preference   `localStorage.matchhire:location` (the user
 *                          previously picked a city/country manually).
 *   2. Browser geolocation `navigator.geolocation.getCurrentPosition`
 *                          - only triggered when the consumer calls
 *                          `requestPermission()`. We never prompt on
 *                          mount; the consent is explicit.
 *   3. IP geolocation      `GET /public/geolocate` server-side proxy.
 *                          Always safe to call (no PII to the client).
 *
 * Exposes:
 *   {
 *     location,            current resolved location (or null)
 *     status,              'idle' | 'detecting' | 'ready' | 'denied'
 *     source,              'manual' | 'browser' | 'ip' | null
 *     requestPermission(), trigger browser geolocation
 *     setManual(country, city, timezone), explicit override
 *     reset(),             clear stored choice and re-resolve
 *   }
 */
import { useCallback, useEffect, useState } from 'react';
import { publicApi } from '../api/index.js';

const STORAGE_KEY = 'matchhire:location';

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeStored(loc) {
  try {
    if (loc) localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* noop */ }
}

export function useLocation() {
  const [location, setLocation] = useState(() => readStored());
  const [source, setSource] = useState(() => (readStored() ? 'manual' : null));
  const [status, setStatus] = useState(() => (readStored() ? 'ready' : 'idle'));

  // On mount, if nothing is stored, fall back to IP geolocation so the
  // listing still shows a sensible "local first" feed without asking
  // for permission. The browser prompt is opt-in via requestPermission().
  useEffect(() => {
    if (location) return;
    let cancelled = false;
    setStatus('detecting');
    publicApi.geolocate()
      .then((data) => {
        if (cancelled || !data || !data.country) { setStatus('idle'); return; }
        const resolved = {
          country: data.country,
          country_code: data.country_code,
          city: data.city,
          timezone: data.timezone,
          latitude: data.latitude,
          longitude: data.longitude,
          source: 'ip',
        };
        setLocation(resolved);
        setSource('ip');
        setStatus('ready');
      })
      .catch(() => { if (!cancelled) setStatus('idle'); });
    return () => { cancelled = true; };
  }, []); // run once

  const requestPermission = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('denied');
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      setStatus('detecting');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const resolved = {
            country: location?.country || null,
            country_code: location?.country_code || null,
            city: location?.city || null,
            timezone: location?.timezone || null,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            source: 'browser',
          };
          setLocation(resolved);
          setSource('browser');
          setStatus('ready');
          writeStored(resolved);
          resolve(resolved);
        },
        () => {
          // User denied. Fall back to whatever IP gave us.
          setStatus('denied');
          resolve(location);
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 }
      );
    });
  }, [location]);

  const setManual = useCallback((country, city = null, timezone = null) => {
    const resolved = { country, city, timezone, latitude: null, longitude: null, source: 'manual' };
    setLocation(resolved);
    setSource('manual');
    setStatus('ready');
    writeStored(resolved);
  }, []);

  const reset = useCallback(() => {
    writeStored(null);
    setLocation(null);
    setSource(null);
    setStatus('idle');
  }, []);

  return { location, status, source, requestPermission, setManual, reset };
}
