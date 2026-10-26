import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('store persists transactions and rolls back failed changes', async () => {
  const { openStore } = await import('../src/store.js');
  const dir = mkdtempSync(join(tmpdir(), 'attendiq-store-'));
  try {
    let store = openStore(dir);
    store.transaction(s => { s.employees.push({ id: '1', name: 'Fixture', email: '', monthlySalary: 100, archived: false, version: 1 }); });
    assert.throws(() => store.transaction(s => { s.employees = []; throw Error('rollback'); }));
    store.close();
    store = openStore(dir);
    assert.equal(store.read().employees[0].name, 'Fixture');
    store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('offline import preserves PHP bcrypt and refuses an occupied database', async () => {
  const { openStore } = await import('../src/store.js');
  const { hashSync, compareSync } = await import('bcryptjs');
  const dir = mkdtempSync(join(tmpdir(), 'attendiq-import-'));
  const store = openStore(dir);
  try {
    const hash = hashSync('Fixture-only-password!', 10).replace('$2b$', '$2y$');
    const state = store.read();
    state.users.push({ id: 'abc', name: 'Fixture', email: 'fixture@example.test', role: 'Admin', active: true, version: 1, authVersion: 1, passwordHash: hash });
    store.importState(state, 'No\tTMNo\tEnNo\tName GMNo\tMode\tDateTime');
    assert.ok(compareSync('Fixture-only-password!', store.read().users[0].passwordHash.replace('$2y$', '$2b$')));
    assert.throws(() => store.importState(state, ''), /empty|already|occupied/i);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
