import type { Request } from 'express';
import type { Store, User, Ticket } from './store.js';
import type { Config } from './config.js';
import type { Context } from './auth.js';
import { csrf } from './auth.js';
import { ApiError, permissions, publicUser, permit, text, email, password, verify, equal, randomId, audit, limit, checkVersion } from './security.js';
import { sendSupport } from './support.js';
import { clientAddress } from './gateway.js';

export async function route(req: Request, ctx: Context, store: Store, config: Config, path: string) {
  const method = req.method, body: Record<string, unknown> = req.body || {}, user = ctx.user;
  const clientIp = clientAddress(req, config.gatewaySecret);
  const authResponse = (u: User) => ({ user: publicUser(u), permissions: permissions[u.role], csrfToken: ctx.session.csrf, setupRequired: false });
  const login = (u: User) => { ctx.rotate(u); ctx.persist(); return authResponse(u); };
  if (path === '/auth/session' && method === 'GET') return { user: user ? publicUser(user) : null, permissions: user ? permissions[user.role] : [], csrfToken: ctx.session.csrf, setupRequired: !config.developmentBypass && !store.read().users.length, developmentBypass: config.developmentBypass };
  if (method !== 'GET') csrf(req, ctx);
  if (path === '/auth/setup' && method === 'POST') {
    const allowed = store.transaction(s => limit(s, `setup:${clientIp}`, 10, 900000));
    if (!allowed) throw new ApiError(429, 'Too many setup attempts. Try again later.');
    if (!equal(body.token, store.setupToken())) throw new ApiError(403, 'Invalid installation token.');
    const name = text(body.name, 'Name'), mail = email(body.email), hash = password(body.password);
    const created = store.transaction(s => {
      if (s.users.length) throw new ApiError(409, 'Administrator already configured. Please log in.');
      const u: User = { id: randomId(), name, email: mail, passwordHash: hash, role: 'Admin', active: true, version: 1, authVersion: 1 };
      s.users.push(u); audit(s, 'admin.setup', u.id, u.id); return u;
    });
    return login(created);
  }
  if (path === '/auth/login' && method === 'POST') {
    const mail = email(body.email), key = `login:${mail}|${clientIp}`;
    const allowed = store.transaction(s => limit(s, `login-ip:${clientIp}`, 40, 900000) && limit(s, key, 10, 900000));
    if (!allowed) throw new ApiError(429, 'Too many login attempts. Try again in 15 minutes.');
    const found = store.read().users.find(u => u.email === mail && u.active);
    const valid = verify(body.password, found?.passwordHash);
    if (!found || !valid) throw new ApiError(401, 'Email or password is incorrect.');
    store.transaction(s => { delete s.limits[key]; audit(s, 'auth.login', found.id, found.id); });
    return login(found);
  }
  if (path === '/auth/logout' && method === 'POST') { ctx.rotate(); ctx.persist(); return { ok: true }; }
  if (path === '/auth/password' && method === 'PUT') {
    if (!user) throw new ApiError(401, 'Please log in.');
    if (!verify(body.currentPassword, user.passwordHash)) throw new ApiError(422, 'Current password is incorrect.');
    const hash = password(body.password);
    const updated = store.transaction(s => { const u = s.users.find(u => u.id === user.id)!; u.passwordHash = hash; u.authVersion++; u.version++; audit(s, 'auth.password', u.id, u.id); return u; });
    login(updated); return { ok: true, csrfToken: ctx.session.csrf };
  }
  if (path === '/defaults' && method === 'GET') {
    permit(user, 'reports.read'); const s = store.read();
    return { attendance: store.attendance(), employees: s.employees.filter(e => !e.archived).map(({id,name,monthlySalary}) => ({id,name,monthlySalary})), archivedIds: s.employees.filter(e => e.archived).map(e => e.id), revision: s.revision };
  }
  if (path === '/employees' && method === 'GET') { permit(user, 'employees.read'); const s = store.read(); return { employees: s.employees, revision: s.revision }; }
  if (path === '/employees' && method === 'POST') {
    permit(user, 'employees.write'); const name = text(body.name, 'Employee name'), mail = body.email ? email(body.email) : '';
    return store.transaction(s => {
      const id = body.id ? text(body.id, 'Device employee ID', 40) : String(1 + Math.max(0, ...s.employees.map(e => /^\d+$/.test(e.id) ? Number(e.id) : 0)));
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) throw new ApiError(422, 'Employee ID can contain letters, digits, underscores or hyphens.');
      if (s.employees.some(e => e.id === id || e.name.toLowerCase() === name.toLowerCase())) throw new ApiError(409, 'Employee ID or name already exists, including archived records.');
      const employee = { id, name, email: mail, monthlySalary: null, archived: false, version: 1 }; s.employees.push(employee); audit(s, 'employee.create', id, user.id); return { employee };
    });
  }
  let match = /^\/employees\/([^/]+)$/.exec(path);
  if (match && ['PUT','DELETE'].includes(method)) {
    permit(user, 'employees.write'); const id = match[1];
    return store.transaction(s => {
      const e = s.employees.find(e => e.id === id); if (!e) throw new ApiError(404, 'Employee not found.'); checkVersion(e, body);
      if (method === 'DELETE') e.archived = true;
      else {
        const name = text(body.name ?? e.name, 'Employee name');
        if (s.employees.some(other => other.id !== id && other.name.toLowerCase() === name.toLowerCase())) throw new ApiError(409, 'Employee name already exists.');
        e.name = name; e.email = body.email ? email(body.email) : '';
        if ('archived' in body) { if (typeof body.archived !== 'boolean') throw new ApiError(422, 'Invalid archive state.'); e.archived = body.archived; }
      }
      e.version++; audit(s, method === 'DELETE' ? 'employee.archive' : 'employee.update', id, user.id); return { employee: e };
    });
  }
  if (path === '/salaries' && method === 'GET') { permit(user, 'salaries.read'); return { employees: store.read().employees.filter(e => !e.archived) }; }
  match = /^\/salaries\/([^/]+)$/.exec(path);
  if (match && method === 'PUT') {
    permit(user, 'salaries.write'); const id = match[1], amount = body.monthlySalary;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > 1e8 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.0001) throw new ApiError(422, 'Salary must be non-negative with at most two decimal places.');
    return store.transaction(s => { const e = s.employees.find(e => e.id === id && !e.archived); if (!e) throw new ApiError(404, 'Active employee not found.'); checkVersion(e, body); e.monthlySalary = Math.round(amount * 100) / 100; e.version++; audit(s, 'salary.update', id, user.id); return { employee: e }; });
  }
  if (path === '/users' && method === 'GET') { permit(user, 'users.manage'); return { users: store.read().users.map(publicUser), roles: Object.keys(permissions) }; }
  if (path === '/users' && method === 'POST') {
    permit(user, 'users.manage'); const name = text(body.name, 'Name'), mail = email(body.email), hash = password(body.password), role = body.role;
    if (typeof role !== 'string' || !Object.hasOwn(permissions, role)) throw new ApiError(422, 'Choose a valid role.');
    return store.transaction(s => {
      if (s.users.some(u => u.email === mail)) throw new ApiError(409, 'Email already exists.');
      const u: User = { id: randomId(), name, email: mail, passwordHash: hash, role: role as User['role'], active: true, version: 1, authVersion: 1 };
      s.users.push(u); audit(s, 'user.create', u.id, user.id); return { user: publicUser(u) };
    });
  }
  match = /^\/users\/([a-f0-9]+)$/.exec(path);
  if (match && method === 'PUT') {
    permit(user, 'users.manage'); const id = match[1];
    return store.transaction(s => {
      const u = s.users.find(u => u.id === id); if (!u) throw new ApiError(404, 'User not found.'); checkVersion(u, body);
      const role = body.role ?? u.role, active = body.active ?? u.active;
      if (typeof role !== 'string' || !Object.hasOwn(permissions, role) || typeof active !== 'boolean') throw new ApiError(422, 'Invalid role or account state.');
      if (u.role === 'Admin' && u.active && (role !== 'Admin' || !active) && s.users.filter(x => x.active && x.role === 'Admin').length <= 1) throw new ApiError(409, 'Keep at least one active administrator.');
      u.role = role as User['role']; u.active = active; u.name = text(body.name ?? u.name, 'Name'); if (body.password) u.passwordHash = password(body.password);
      u.authVersion++; u.version++; audit(s, 'user.update', id, user.id); return { user: publicUser(u) };
    });
  }
  if (path === '/support' && method === 'POST') {
    permit(user, 'support.send'); const subject = text(body.subject, 'Subject', 160), message = body.message;
    if (typeof message !== 'string' || message.trim().length < 10 || [...message].length > 10000 || message.includes('\0')) throw new ApiError(422, 'Message must contain 10 to 10000 characters.');
    if (!store.transaction(s => limit(s, `support:${user.id}`, 5, 3600000))) throw new ApiError(429, 'Support limit reached. Try again later.');
    const ticket: Ticket = { id: 'IQ-' + randomId().slice(0,10).toUpperCase(), subject, message: message.trim(), userId: user.id, createdAt: new Date().toISOString(), status: 'pending' };
    store.transaction(s => { s.tickets.push(ticket); });
    let failure: unknown;
    try { await sendSupport(config, ticket, user); ticket.status = 'accepted'; } catch (error) { ticket.status = 'failed'; failure = error; }
    store.transaction(s => { s.tickets.find(t => t.id === ticket.id)!.status = ticket.status; audit(s, `support.${ticket.status}`, ticket.id, user.id); });
    if (failure) throw failure;
    return { ticketId: ticket.id, status: 'accepted', message: 'The mail server accepted your request for info@niyanti.com.' };
  }
  throw new ApiError(404, 'API endpoint not found.');
}
