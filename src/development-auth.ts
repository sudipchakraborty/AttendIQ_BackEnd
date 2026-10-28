import type { User } from './store.js';

/**
 * @brief Provide a temporary development identity without storing an account or password.
 * @param enabled Explicit development-only configuration switch.
 * @returns An administrator identity when enabled; otherwise null.
 */
export function developmentUser(enabled: boolean): User | null {
  return enabled ? {
    id: 'dev-local-admin', name: 'Local Developer', email: 'developer@example.test',
    role: 'Admin', active: true, version: 1, authVersion: 1, passwordHash: '',
  } : null;
}
