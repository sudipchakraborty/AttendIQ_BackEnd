import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import type { AddressInfo } from 'node:net';

test('Node API preserves auth, roles, persistence, versions, limits and SMTP contract', async () => {
  const { createApp } = await import('../src/app.js');
  const { openStore } = await import('../src/store.js');
  const { loadConfig } = await import('../src/config.js');
  const dir = mkdtempSync(join(tmpdir(), 'attendiq-api-'));
  const store = openStore(dir);
  const config = loadConfig({ ATTENDIQ_STORAGE: dir });
  const app = createApp(config, store);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  function client() {
    let cookie = '', csrf = '';
    return async (route: string, method = 'GET', body?: unknown, omit = false) => {
      const res = await fetch(`${base}/api${route}`, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': omit ? '' : csrf }, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
      const header = res.headers.get('set-cookie'); if (header) cookie = header.split(';')[0];
      const data = await res.json(); if (data.csrfToken) csrf = data.csrfToken;
      return { status: res.status, data, header };
    };
  }
  const admin = client(), hr = client(), viewer = client(), other = client();
  const password = 'TestOnly-Password-123!';
  try {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await fetch(`${base}/ready`)).status, 200);
    assert.equal((await admin('/employees')).status, 401);
    await admin('/auth/session'); await other('/auth/session');
    const owner = { token: store.setupToken(), name: 'Fixture Owner', email: 'owner@example.test', password };
    assert.equal((await admin('/auth/setup', 'POST', owner, true)).status, 419);
    assert.equal((await admin('/auth/setup', 'POST', { ...owner, token: 'bad' })).status, 403);
    const setup = await admin('/auth/setup', 'POST', owner);
    assert.equal(setup.status, 200); assert.match(setup.header!, /HttpOnly/i); assert.match(setup.header!, /SameSite=Strict/i);
    assert.equal(setup.header!.match(/AttendIQSession=/g)!.length, 1, 'Rotation must send exactly one current session cookie');
    assert.equal((await other('/auth/setup', 'POST', owner)).status, 409);
    assert.equal((await admin(`/users/${setup.data.user.id}`, 'PUT', { version: 1, role: 'Viewer' })).status, 409);
    assert.equal((await admin('/employees', 'POST', { id: '99', name: 'Fixture Employee' })).status, 200);
    assert.equal((await admin('/employees', 'POST', { id: '100', name: 'fixture employee' })).status, 409);
    assert.equal((await admin('/salaries/99', 'PUT', { version: 1, monthlySalary: 12345.67 })).status, 200);
    assert.equal((await admin('/employees/99', 'PUT', { version: 1, name: 'Stale' })).status, 409);
    assert.equal((await admin('/employees/99', 'PUT', { version: 2, name: 'Renamed Fixture' })).status, 200);
    assert.equal((await admin('/employees/99', 'DELETE', { version: 3 })).status, 200);
    assert.deepEqual((await admin('/defaults')).data.archivedIds, ['99']);
    assert.equal((await admin('/employees/99', 'PUT', { version: 4, archived: false })).status, 200);
    for (const amount of [-1, '10', 0.001, 100000001]) assert.equal((await admin('/salaries/99', 'PUT', { version: 5, monthlySalary: amount })).status, 422);
    let viewerId = '';
    for (const [role, call] of [['HR', hr], ['Viewer', viewer]] as const) {
      const created = await admin('/users', 'POST', { name: `Fixture ${role}`, email: `${role.toLowerCase()}@example.test`, password, role });
      assert.equal(created.status, 200); if (role === 'Viewer') viewerId = created.data.user.id;
      assert.equal('passwordHash' in created.data.user, false);
      await call('/auth/session');
      assert.equal((await call('/auth/login', 'POST', { email: `${role.toLowerCase()}@example.test`, password })).status, 200);
      assert.equal((await call('/users')).status, 403);
    }
    assert.equal((await hr('/employees')).status, 200);
    assert.equal((await viewer('/employees')).status, 403);
    assert.equal((await viewer('/employees', 'POST', { name: 'forbidden' })).status, 403);
    assert.equal((await viewer('/salaries/99', 'PUT', { version: 5, monthlySalary: 1 })).status, 403);
    assert.equal((await viewer('/defaults')).status, 200);
    assert.equal('email' in (await viewer('/defaults')).data.employees[0], false);
    assert.equal((await admin(`/users/${viewerId}`, 'PUT', { version: 1, active: false })).status, 200);
    assert.equal((await viewer('/defaults')).status, 401);
    const missing = await admin('/support', 'POST', { subject: 'Fixture', message: 'Local SMTP failure fixture only.' });
    assert.equal(missing.status, 503); assert.equal(store.read().tickets.at(-1)!.status, 'failed');
    const messages: string[] = [];
    const smtp = net.createServer(socket => {
      socket.write('220 fixture ESMTP\r\n'); let buffer = '', inData = false, content = '';
      socket.on('data', chunk => { buffer += chunk; while (buffer.includes('\r\n')) {
        const i = buffer.indexOf('\r\n'), line = buffer.slice(0, i); buffer = buffer.slice(i + 2);
        if (inData) { if (line === '.') { messages.push(content); inData = false; socket.write('250 accepted\r\n'); } else content += line + '\n'; }
        else if (/^DATA/i.test(line)) { inData = true; socket.write('354 continue\r\n'); }
        else if (/^QUIT/i.test(line)) socket.end('221 bye\r\n'); else socket.write('250 fixture\r\n');
      }});
    });
    await new Promise<void>(r => smtp.listen(0, '127.0.0.1', r));
    try {
      config.smtp = { host: '127.0.0.1', port: (smtp.address() as AddressInfo).port, secure: false, user: '', password: '', from: 'fixture@example.test' };
      assert.equal((await admin('/support', 'POST', { subject: 'Fixture', message: 'Local SMTP acceptance fixture only.' })).status, 200);
      assert.match(messages[0], /info@niyanti\.com/); assert.match(messages[0], /owner@example\.test/);
    } finally { await new Promise<void>(r => smtp.close(() => r())); }
    await other('/auth/login', 'POST', { email: owner.email, password });
    assert.equal((await admin('/auth/password', 'PUT', { currentPassword: password, password: password + 'new' })).status, 200);
    assert.equal((await other('/defaults')).status, 401);
    assert.equal((await admin('/defaults')).status, 200);
    assert.equal((await admin('/auth/logout', 'POST')).status, 200);
    assert.equal((await admin('/defaults')).status, 401);
    await other('/auth/session');
    for (let i = 0; i < 10; i++) assert.equal((await other('/auth/login', 'POST', { email: 'absent@example.test', password })).status, 401);
    assert.equal((await other('/auth/login', 'POST', { email: 'absent@example.test', password })).status, 429);
    const oversized = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(JSON.stringify({ message: 'x'.repeat(33000) }))); c.close(); } });
    const response = await fetch(`${base}/api/support`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: oversized, duplex: 'half' } as RequestInit);
    assert.equal(response.status, 413);
    assert.equal((await fetch(`${base}/api/index.php?route=%2Fauth%2Fsession`)).status, 200);
    assert.ok(!JSON.stringify(store.read()).includes(password));
  } finally { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); store.close(); rmSync(dir, { recursive: true, force: true }); }
});
