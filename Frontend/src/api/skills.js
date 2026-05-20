/**
 * Skills API client
 * -----------------
 * Wrappers around the public skill catalogue + candidate skill
 * management. Catalogue reads are GET (public); candidate writes
 * are POST/DELETE (authenticated).
 *
 * Mounted at `/api/v1/skills` (catalogue) and `/api/v1/candidates/skills*`
 * (candidate-only).
 */
import { api, call } from './client.js';

export const skillsApi = {
  /** Fuzzy catalogue search; `q` is optional (empty returns top alphabetical). */
  search(q = '', limit = 20) {
    return call(api.get('/skills', { params: { search: q, limit } }));
  },

  /** Catalogue grouped by category — used by the picker's category panel. */
  categories() {
    return call(api.get('/skills/categories'));
  },

  /** Flat category-name + count list (cheap). */
  categoriesMeta() {
    return call(api.get('/skills/categories', { params: { meta: 1 } }));
  },

  /** Authenticated: read my current skill set (lightweight). */
  myList() {
    return call(api.post('/candidates/skills/list'));
  },

  /**
   * Authenticated: replace OR append the candidate's skill set.
   * Each entry is `{ skill_id, ... }` (catalogue pick) or
   * `{ name, ... }` (free-text custom). The backend de-dupes and
   * enforces min/max bounds.
   */
  save({ skills, mode = 'set' }) {
    return call(api.post('/candidates/skills', { skills, mode }));
  },

  /** Authenticated: remove a single skill. */
  remove(skillId) {
    return call(api.delete(`/candidates/skills/${skillId}`));
  },

  /** Public: skills of a single candidate (only if their profile is public). */
  forCandidate(candidateId) {
    return call(api.get(`/public/candidates/${candidateId}/skills`));
  },
};
