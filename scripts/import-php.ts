import { readFileSync, existsSync, mkdirSync, mkdtempSync, copyFileSync, linkSync, rmSync, constants } from 'node:fs';
import { resolve, join } from 'node:path';
import { openStore, validateState } from '../src/store.js';

const [stateFile, attendanceFile, destination] = process.argv.slice(2);
if (!stateFile || !attendanceFile || !destination) throw Error('Usage: npm run import:php -- <state.json> <attendance.txt> <new-private-directory>');
if (existsSync(join(resolve(destination), 'attendiq.sqlite'))) throw Error('Destination database already exists. Import to a new directory; preserve the old directory for rollback.');
const state = JSON.parse(readFileSync(stateFile, 'utf8'));
// PHP serializes an empty associative array as []; normalize it to a dictionary.
if (Array.isArray(state.limits) && state.limits.length === 0) state.limits = {};
// Expired PHP rate limits use a different time representation; never import them.
state.limits = {};
const attendance = readFileSync(attendanceFile, 'utf8');
validateState(state);
mkdirSync(resolve(destination), {recursive:true,mode:0o700});
const staging = mkdtempSync(join(resolve(destination), '.import-'));
const store = openStore(staging);
try {
  store.importState(state, attendance);
  store.close();
  // Closing checkpoints WAL. Hard-link promotion is atomic and refuses replacement.
  linkSync(join(staging,'attendiq.sqlite'),join(resolve(destination),'attendiq.sqlite'));
  if (!existsSync(join(resolve(destination),'setup-token.txt'))) copyFileSync(join(staging,'setup-token.txt'),join(resolve(destination),'setup-token.txt'),constants.COPYFILE_EXCL);
  console.log(JSON.stringify({ imported: true, employees: state.employees.length, users: state.users.length }));
} finally { try { store.close(); } catch { /* Already closed before promotion. */ } rmSync(staging,{recursive:true,force:true}); }
