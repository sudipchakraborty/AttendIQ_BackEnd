import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';

test('failed import never leaves a destination database that startup mistakes for migrated data', () => {
  const dir = mkdtempSync(join(tmpdir(), 'attendiq-interrupted-'));
  try {
    writeFileSync(join(dir,'state.json'), JSON.stringify({revision:1,employees:[],users:[],audit:[],tickets:[],limits:{}}));
    const result = spawnSync(process.execPath, ['--import','tsx','scripts/import-php.ts',join(dir,'state.json'),join(dir,'missing-attendance.txt'),join(dir,'destination')], { encoding:'utf8', windowsHide:true });
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(join(dir,'destination','attendiq.sqlite')), false);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('authenticated gateway identities isolate clients and reject spoofed forwarding headers', async () => {
  const { clientAddress } = await import('../src/gateway.js');
  const secret = 'a'.repeat(64), timestamp = String(Date.now());
  const sign = (ip: string) => createHmac('sha256',secret).update(`${timestamp}\n${ip}`).digest('hex');
  function req(ip: string, signature: string) { return {ip:'hostinger',headers:{'x-attendiq-client-ip':ip,'x-attendiq-timestamp':timestamp,'x-attendiq-signature':signature}}; }
  assert.equal(clientAddress(req('198.51.100.1',sign('198.51.100.1')),secret),'198.51.100.1');
  assert.equal(clientAddress(req('198.51.100.2',sign('198.51.100.2')),secret),'198.51.100.2');
  assert.equal(clientAddress(req('198.51.100.1','bad'),secret),'hostinger');
  assert.equal(clientAddress({...req('198.51.100.1',sign('198.51.100.1')),headers:{...req('198.51.100.1','').headers,'x-attendiq-timestamp':'0','x-attendiq-signature':sign('198.51.100.1')}},secret),'hostinger');
});

test('deployment handles immediate restart failure through rollback', { skip: process.platform === 'win32' ? 'Requires native Linux symlinks; also executed on Contabo.' : false }, () => {
  const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
  const result = spawnSync(bash, ['tests/deploy-rollback.sh'], { encoding: 'utf8', windowsHide: true, env: { ...process.env, MSYS: 'winsymlinks:nativestrict', MSYS2_ARG_CONV_EXCL: '*' } });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
