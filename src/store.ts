import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export interface Employee { id: string; name: string; email: string; monthlySalary: number | null; archived: boolean; version: number }
export interface User { id: string; name: string; email: string; passwordHash: string; role: 'Admin'|'HR'|'Viewer'; active: boolean; version: number; authVersion: number }
export interface Ticket { id: string; subject: string; message: string; userId: string; createdAt: string; status: 'pending'|'accepted'|'failed' }
export interface State { revision: number; employees: Employee[]; users: User[]; audit: { at: string; actor: string | null; action: string; target: string }[]; tickets: Ticket[]; limits: Record<string, { count: number; until: number }> }
export interface Session { csrf: string; userId?: string; authVersion?: number; createdAt: number; lastSeen: number }
export const emptyState = (): State => ({ revision: 1, employees: [], users: [], audit: [], tickets: [], limits: {} });
export function openStore(directory: string) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, 'attendiq.sqlite');
  const db = new DatabaseSync(path);
  chmodSync(path, 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY);
    INSERT OR IGNORE INTO migrations VALUES (1);
    CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, value TEXT NOT NULL, expires INTEGER NOT NULL);`);
  db.prepare('INSERT OR IGNORE INTO state VALUES (1, ?)').run(JSON.stringify(emptyState()));
  const tokenPath = join(directory, 'setup-token.txt');
  if (!existsSync(tokenPath)) writeFileSync(tokenPath, randomBytes(24).toString('hex'), { flag: 'wx', mode: 0o600 });
  const read = (): State => JSON.parse((db.prepare('SELECT value FROM state WHERE id=1').get() as {value: string}).value);
  function transaction<T>(action: (state: State) => T): T {
    db.exec('BEGIN IMMEDIATE');
    try {
      const state = read();
      const result = action(state);
      if (result instanceof Promise) throw Error('Store transactions must be synchronous.');
      db.prepare('UPDATE state SET value=? WHERE id=1').run(JSON.stringify(state));
      db.exec('COMMIT');
      return result;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  return {
    read, transaction,
    setupToken: () => readFileSync(tokenPath, 'utf8').trim(),
    attendance: () => (db.prepare("SELECT value FROM settings WHERE key='attendance'").get() as {value: string} | undefined)?.value || '',
    importState(state: State, attendance: string) {
      validateState(state);
      db.exec('BEGIN IMMEDIATE');
      try {
        const current = read();
        if (current.users.length || current.employees.length || current.tickets.length || current.audit.length || db.prepare("SELECT key FROM settings WHERE key='imported'").get()) throw Error('Import requires an empty database.');
        db.prepare('UPDATE state SET value=? WHERE id=1').run(JSON.stringify(state));
        db.prepare("INSERT OR REPLACE INTO settings VALUES ('attendance', ?)").run(attendance);
        db.prepare("INSERT INTO settings VALUES ('imported', ?)").run(new Date().toISOString());
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    getSession(id: string): Session | null {
      const row = db.prepare('SELECT value FROM sessions WHERE id=? AND expires>?').get(id, Date.now()) as {value: string} | undefined;
      return row ? JSON.parse(row.value) : null;
    },
    saveSession(id: string, session: Session) {
      db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
      db.prepare('INSERT OR REPLACE INTO sessions VALUES (?, ?, ?)').run(id, JSON.stringify(session), Math.min(session.lastSeen + 1800000, session.createdAt + 28800000));
    },
    deleteSession(id: string) { db.prepare('DELETE FROM sessions WHERE id=?').run(id); },
    ready() { db.prepare('SELECT 1').get(); return true; },
    close() { db.close(); }
  };
}
export type Store = ReturnType<typeof openStore>;
export function validateState(state: State) {
  if (!state || !Number.isSafeInteger(state.revision) || state.revision < 1 || !Array.isArray(state.users) || !Array.isArray(state.employees) || !Array.isArray(state.audit) || !Array.isArray(state.tickets) || !state.limits || typeof state.limits !== 'object' || Array.isArray(state.limits)) throw Error('Invalid source state.');
  const ids = new Set<string>(), names = new Set<string>(), emails = new Set<string>();
  for (const e of state.employees) {
    if (typeof e.id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(e.id) || typeof e.name !== 'string' || !e.name.trim() || ids.has(e.id) || names.has(e.name.toLowerCase()) || typeof e.email !== 'string' || typeof e.archived !== 'boolean' || !Number.isSafeInteger(e.version) || e.version < 1 || (e.monthlySalary !== null && (typeof e.monthlySalary !== 'number' || !Number.isFinite(e.monthlySalary) || e.monthlySalary < 0 || e.monthlySalary > 1e8))) throw Error('Invalid or duplicate source employee.');
    ids.add(e.id); names.add(e.name.toLowerCase());
  }
  ids.clear();
  for (const u of state.users) {
    if (typeof u.id !== 'string' || !/^[a-f0-9]+$/.test(u.id) || ids.has(u.id) || typeof u.name !== 'string' || !u.name.trim() || typeof u.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email) || emails.has(u.email.toLowerCase()) || !['Admin','HR','Viewer'].includes(u.role) || typeof u.active !== 'boolean' || !Number.isSafeInteger(u.version) || u.version < 1 || !Number.isSafeInteger(u.authVersion) || u.authVersion < 1 || !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(u.passwordHash)) throw Error('Invalid source account or unsupported password hash.');
    ids.add(u.id); emails.add(u.email.toLowerCase());
  }
  if (state.users.length && !state.users.some(u => u.active && u.role === 'Admin')) throw Error('Source requires an active administrator.');
}
