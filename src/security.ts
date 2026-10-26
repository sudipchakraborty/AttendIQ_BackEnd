import { randomBytes, timingSafeEqual } from 'node:crypto';
import { hashSync, compareSync } from 'bcryptjs';
import type { State, User } from './store.js';
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export const permissions = {
  Admin: ['employees.read','employees.write','salaries.read','salaries.write','reports.read','users.manage','support.send'],
  HR: ['employees.read','employees.write','salaries.read','salaries.write','reports.read','support.send'],
  Viewer: ['reports.read','support.send']
};
export const randomToken = () => randomBytes(24).toString('hex');
export const randomId = () => randomBytes(8).toString('hex');
export function equal(a: unknown, b: string) { return typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
export function text(value: unknown, label: string, max = 120): string {
  if (typeof value !== 'string' || !value.trim() || [...value.trim()].length > max || /[\x00-\x1f\x7f]/u.test(value)) throw new ApiError(422, `${label} is missing or invalid.`);
  return value.trim();
}
export function email(value: unknown) { const result = text(value, 'Email', 254).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new ApiError(422, 'Enter a valid email address.'); return result; }
export function password(value: unknown) { if (typeof value !== 'string' || Buffer.byteLength(value) < 12 || Buffer.byteLength(value) > 72) throw new ApiError(422, 'Use a password between 12 and 72 bytes.'); return hashSync(value, 12); }
const dummyHash = hashSync('dummy-never-valid-' + randomToken(), 12);
export function verify(value: unknown, hash = dummyHash) { return compareSync(typeof value === 'string' && Buffer.byteLength(value) <= 72 ? value : '', hash.replace(/^\$2y\$/, '$2b$')); }
export function publicUser(u: User) { const { id,name,email,role,active,version } = u; return { id,name,email,role,active,version }; }
export function permit(user: User | null, permission: string): asserts user is User { if (!user) throw new ApiError(401, 'Please log in to continue.'); if (!permissions[user.role].includes(permission)) throw new ApiError(403, 'Your role does not allow this action.'); }
export function checkVersion(item: {version: number}, body: Record<string, unknown>) { if (body.version !== item.version) throw new ApiError(409, 'This record changed. Refresh and try again.'); }
export function audit(s: State, action: string, target: string, actor: string | null) { s.audit.push({ at: new Date().toISOString(), action, target, actor }); s.revision++; }
export function limit(s: State, key: string, max: number, windowMs: number) {
  const now = Date.now();
  for (const [k,v] of Object.entries(s.limits)) if (v.until <= now) delete s.limits[k];
  const entry = s.limits[key] || { count: 0, until: now + windowMs };
  entry.count++; s.limits[key] = entry; return entry.count <= max;
}
