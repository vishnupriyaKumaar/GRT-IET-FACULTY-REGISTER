// Tests the server rules (api/_lib/core.js) against a pretend Firestore and against the local file database.
//   node scripts/test-api.mjs
import assert from 'node:assert/strict';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
import { makeFirestore } from '../api/_lib/db.js';

// ---- fake Firestore (just the calls the adapter uses) ---------------------------------------------------------------
function fakeFirestore() {
  const data = {};
  const ref = (n, id) => ({ id, async get() { const v = data[n]?.[id]; return { exists: !!v, data: () => v }; }, async set(v) { (data[n] ||= {})[id] = JSON.parse(JSON.stringify(v)); }, async delete() { delete data[n]?.[id]; } });
  const snapOf = (n, pred) => ({ docs: Object.entries(data[n] || {}).filter(([, v]) => pred(v)).map(([id, v]) => ({ data: () => v, ref: ref(n, id) })) });
  return { collection: (n) => ({ doc: (id) => ref(n, id), get: async () => snapOf(n, () => true), where: (f, op, val) => ({ get: async () => snapOf(n, (v) => v[f] === val) }), select: () => ({ get: async () => snapOf(n, () => true) }) }) };
}



// ---- scenario ---------------------------------------------------------------------------------------------------------
async function scenario(label, env, fs) {
  const { handle } = await import('../api/_lib/core.js');
  const { resetDb, injectDb } = await import('../api/_lib/db.js'); resetDb(); if (fs) injectDb(makeFirestore(async () => fs));
  const call = async (action, body = {}, token) => handle({ action, ...body }, token ? 'Bearer ' + token : '', env);
  assert.equal((await call('ping')).json.configured, true);
  assert.equal((await call('login', { role: 'admin', password: 'wrong' })).status, 401);
  const admin = (await call('login', { role: 'admin', password: 'grtcse@1234' })).json.token;
  const teacher = (await call('login', { role: 'teacher' })).json.token;
  assert.ok(admin && teacher);
  assert.equal((await call('pull', {}, undefined)).status, 401, 'no token');
  assert.equal((await call('pull', {}, admin.slice(0, -3) + 'abc')).status, 401, 'forged token');
  assert.equal((await call('pull', {}, teacher)).status, 403, 'teacher cannot read the register');
  const v0 = (await call('pull', {}, admin)).json.version;
  // teacher adds a teacher + record
  const z = Buffer.from('hello').toString('base64');
  assert.equal((await call('putStaff', { staff: { id: 't1', name: 'Dr. Kamal. N.' } }, teacher)).status, 200);
  assert.equal((await call('putRecord', { record: { key: '2026-2027 (Odd Semester)|t1', term: '2026-2027 (Odd Semester)', staffId: 't1', enc: 'raw', z, updated: 5 } }, teacher)).status, 200);
  assert.equal((await call('putRecord', { record: { key: 'x|t1', term: 'x', staffId: 't1', enc: 'gz', z: 'A'.repeat(100000), updated: 1 } }, teacher)).status, 413, 'size cap');
  // teacher can find that name, but not list
  const lk = (await call('lookup', { name: '  dr.  kamal. n. ' }, teacher)).json;
  assert.equal(lk.staff.id, 't1'); assert.equal(lk.records.length, 1);
  // admin pull + incremental
  let p = (await call('pull', { have: {} }, admin)).json;
  assert.equal(p.staff.length, 1); assert.equal(p.records.length, 1); assert.equal(p.manifest.length, 1);
  p = (await call('pull', { have: { '2026-2027 (Odd Semester)|t1': 5 } }, admin)).json;
  assert.equal(p.records.length, 0, 'nothing changed');
  assert.notEqual(p.version, v0, 'writes change the version');
  assert.equal((await call('pull', { version: p.version }, admin)).json.same, true, 'unchanged -> cheap answer');
  // admin moves a record to another year / semester
  await call('putRecord', { record: { key: '2027-2028 (Even Semester)|t1', term: '2027-2028 (Even Semester)', staffId: 't1', enc: 'raw', z, updated: 7 } }, admin);
  assert.equal((await call('deleteRecord', { key: '2027-2028 (Even Semester)|t1' }, teacher)).status, 403);
  assert.equal((await call('deleteRecord', { key: '2027-2028 (Even Semester)|t1' }, admin)).status, 200);
  assert.equal((await call('pull', { have: {} }, admin)).json.manifest.length, 1);
  // admin relieves; teacher can no longer save for them and cannot change status
  await call('putStaff', { staff: { id: 't1', name: 'Dr. Kamal. N.', status: 'relieved', relievedTerm: '2026-2027 (Odd Semester)', updated: 9 } }, admin);
  assert.equal((await call('putRecord', { record: { key: '2027-2028 (Odd Semester)|t1', term: '2027-2028 (Odd Semester)', staffId: 't1', enc: 'raw', z, updated: 6 } }, teacher)).status, 403);
  assert.equal((await call('putStaff', { staff: { id: 't1', name: 'Dr. Kamal. N.' } }, teacher)).status, 403);
  // files in pieces
  await call('putFile', { chunk: { id: 'f1', idx: 0, total: 2, chunk: 'AAA' } }, teacher);
  await call('putFile', { chunk: { id: 'f1', idx: 1, total: 2, chunk: 'BBB' } }, teacher);
  const g = (await call('getFile', { id: 'f1', idx: 1 }, admin)).json; assert.equal(g.chunk, 'BBB'); assert.equal(g.total, 2);
  assert.deepEqual((await call('fileIds', {}, admin)).json.ids, ['f1']);
  // password change
  assert.equal((await call('changePassword', { current: 'nope', next: 'abcdef' }, admin)).status, 400);
  assert.equal((await call('changePassword', { current: 'grtcse@1234', next: 'abc' }, admin)).status, 400);
  assert.equal((await call('changePassword', { current: 'grtcse@1234', next: 'newpass1' }, teacher)).status, 403);
  assert.equal((await call('changePassword', { current: 'grtcse@1234', next: 'newpass1' }, admin)).status, 200);
  assert.equal((await call('login', { role: 'admin', password: 'grtcse@1234' })).status, 401);
  assert.equal((await call('login', { role: 'admin', password: 'newpass1' })).status, 200);
  // delete
  assert.equal((await call('deleteStaff', { id: 't1' }, teacher)).status, 403);
  await call('deleteStaff', { id: 't1' }, admin);
  p = (await call('pull', { have: {} }, admin)).json; assert.equal(p.staff.length, 0); assert.equal(p.manifest.length, 0);
  await call('clearAll', {}, admin);
  console.log('PASS', label);
}
await scenario('Firebase Firestore adapter (fake)', { FIREBASE_SERVICE_ACCOUNT: 'x' }, fakeFirestore());
const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'grt-')), 'db.json');
await scenario('file adapter', { LOCAL_DB_FILE: f });
