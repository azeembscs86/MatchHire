/**
 * Public surface of the API layer.
 *
 *   import { api, authApi, publicApi, candidatesApi, employersApi, adminApi } from '../api';
 *
 * Prefer this barrel over deep imports - rewriting the underlying
 * client/storage is then a single-file change.
 */
export { api, call, tokens, apiBaseUrl } from './client.js';
export { authApi } from './auth.js';
export { publicApi } from './public.js';
export { homeApi } from './home.js';
export { skillsApi } from './skills.js';
export { candidatesApi } from './candidates.js';
export { employersApi } from './employers.js';
export { adminApi } from './admin.js';
