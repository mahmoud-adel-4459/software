'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { Store } = require('../server/store.cjs');
const { hashPassword } = require('../shared/crypto.cjs');

test('real PostgreSQL: concurrent exit, idempotent retry and transaction rollback', { skip: !process.env.TEST_DATABASE_URL }, async t => {
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  const control = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  await control.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
  t.after(async () => { await pool.end(); await control.query(`DROP SCHEMA ${schema} CASCADE`); await control.end(); });
  const store = new Store(pool); await store.migrate();
  const userId = randomUUID();
  await pool.query('INSERT INTO users(id,username,name,password_hash,role) VALUES($1,$2,$3,$4,$5)',
    [userId, 'test', 'test', await hashPassword('test-long-password'), 'admin']);
  const context = { user: { id: userId, role: 'admin' }, kind: 'internal', deviceId: randomUUID() };
  const soldier = await store.mutate(context, randomUUID(), { action: 'create' }, c => store.createSoldier(c, context,
    { militaryNo: '000001', nationalId: '30101010101011', name: 'test', rank: 'جندي', company: 'test', unit: 'test', phone: '', address: '' }));
  const movement = { kind: 'exit', soldierId: soldier.id, reason: 'test', expectedReturn: new Date(Date.now() + 86400000).toISOString(), notes: '' };
  const ids = [randomUUID(), randomUUID()];
  const exits = await Promise.allSettled(ids.map(id => store.mutate(context, id, movement, c => store.gate(c, context, movement, id))));
  assert.equal(exits.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await pool.query('SELECT * FROM permits WHERE returned_at IS NULL')).rows.length, 1);
  const index = exits.findIndex(r => r.status === 'fulfilled');
  const retries = await Promise.all(Array.from({ length: 4 }, () => store.mutate(context, ids[index], movement, c => store.gate(c, context, movement, ids[index]))));
  assert.equal(new Set(retries.map(r => r.id)).size, 1);
  assert.equal((await pool.query('SELECT * FROM gate_events')).rows.length, 1);
  const before = (await pool.query('SELECT COUNT(*) FROM soldiers')).rows[0].count;
  await assert.rejects(store.mutate(context, randomUUID(), { action: 'fail' }, async client => {
    await store.createSoldier(client, context, { militaryNo: '000002', nationalId: '30101010101012', name: 'rollback', rank: 'جندي', company: 'test', unit: 'test', phone: '', address: '' });
    throw new Error('simulated disk/statement failure');
  }));
  assert.equal((await pool.query('SELECT COUNT(*) FROM soldiers')).rows[0].count, before);
});
