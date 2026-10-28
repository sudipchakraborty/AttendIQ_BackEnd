import type { Request, Response, NextFunction } from 'express';
import type { Config } from './config.js';
import type { Store, Session, User } from './store.js';
import { equal, randomToken, ApiError } from './security.js';
import { developmentUser } from './development-auth.js';
export interface Context { session: Session; user: User | null; rotate(user?: User): void; persist(): void }
export function sessionMiddleware(config: Config, store: Store) {
  return (req: Request, res: Response, next: NextFunction) => {
    const cookies = (req.headers.cookie || '').split(';').map(v => v.trim());
    let id = cookies.find(v => v.startsWith('AttendIQSession='))?.slice(16) || '';
    let session = /^[a-f0-9]{48}$/.test(id) ? store.getSession(id) : null;
    const now = Date.now();
    if (!session || now - session.lastSeen > 1800000 || now - session.createdAt > 28800000) {
      if (id) store.deleteSession(id);
      id = randomToken(); session = { csrf: randomToken(), createdAt: now, lastSeen: now };
    }
    let user = session.userId ? store.read().users.find(u => u.id === session!.userId && u.active && u.authVersion === session!.authVersion) || null : null;
    if (session.userId && !user) { store.deleteSession(id); id = randomToken(); session = { csrf: randomToken(), createdAt: now, lastSeen: now }; }
    session.lastSeen = now;
    const context: Context = {
      session, user: developmentUser(config.developmentBypass) || user,
      rotate(account) {
        store.deleteSession(id); id = randomToken();
        context.session = { csrf: randomToken(), createdAt: Date.now(), lastSeen: Date.now(), ...(account ? { userId: account.id, authVersion: account.authVersion } : {}) };
        context.user = account || null;
      },
      persist() {
        store.saveSession(id, context.session);
        res.removeHeader('Set-Cookie');
        res.cookie('AttendIQSession', id, { httpOnly: true, secure: config.secureCookies, sameSite: 'strict', path: '/' });
      }
    };
    res.locals.context = context;
    // Persist before handlers; handlers persist rotations explicitly before returning.
    context.persist();
    next();
  };
}
export function csrf(req: Request, context: Context) { if (!equal(req.headers['x-csrf-token'], context.session.csrf)) throw new ApiError(419, 'Your session token expired. Refresh and try again.'); }
