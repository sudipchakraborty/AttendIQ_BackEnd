import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { openStore } from '../src/store.js';

const [stateFile, attendanceFile, destination] = process.argv.slice(2);
if (!stateFile || !attendanceFile || !destination) throw Error('Usage: npm run import:php -- <state.json> <attendance.txt> <new-private-directory>');
if (existsSync(join(resolve(destination), 'attendiq.sqlite'))) throw Error('Destination database already exists. Import to a new directory; preserve the old directory for rollback.');
const state = JSON.parse(readFileSync(stateFile, 'utf8'));
// PHP serializes an empty associative array as []; normalize it to a dictionary.
if (Array.isArray(state.limits) && state.limits.length === 0) state.limits = {};
// Expired PHP rate limits use a different time representation; never import them.
state.limits = {};
const store = openStore(resolve(destination));
try {
  store.importState(state, readFileSync(attendanceFile, 'utf8'));
  console.log(JSON.stringify({ imported: true, employees: state.employees.length, users: state.users.length }));
} finally { store.close(); }
