import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.js';
import { openStore } from '../src/store.js';
import { createApp } from '../src/app.js';

/** @brief Development access must be explicit, reversible, and unavailable in production. */
test('development bypass grants API access without creating an account; default stays protected', async () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production', ATTENDIQ_DEV_AUTH_BYPASS: '1' }), /development/i);
  for (const bypass of ['0', '1']) {
    const directory = mkdtempSync(join(tmpdir(), 'attendiq-dev-auth-'));
    const store = openStore(directory);
    const config = loadConfig({ NODE_ENV: 'development', ATTENDIQ_STORAGE: directory, ATTENDIQ_DEV_AUTH_BYPASS: bypass });
    const server = createApp(config, store).listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    const address = server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}/api`;
    try {
      const session = await (await fetch(`${base}/auth/session`)).json();
      assert.equal(session.developmentBypass, bypass === '1');
      assert.equal(session.user?.role ?? null, bypass === '1' ? 'Admin' : null);
      assert.equal((await fetch(`${base}/employees`)).status, bypass === '1' ? 200 : 401);
      assert.equal(store.read().users.length, 0);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      store.close();
      rmSync(directory, { recursive: true, force: true });
    }
  }
});
