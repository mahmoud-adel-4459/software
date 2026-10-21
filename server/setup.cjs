'use strict';
const { Pool } = require('pg');
const { randomUUID } = require('node:crypto');
const { Store } = require('./store.cjs');
const { hashPassword } = require('../shared/crypto.cjs');
async function main() {
  const password = process.env.ADMIN_PASSWORD;
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const store = new Store(pool); await store.migrate();
    const existing = await pool.query("SELECT id FROM users WHERE role='admin' AND disabled=false LIMIT 1");
    if (existing.rows.length) { console.log('Schema upgraded. Existing administrator accounts were not changed.'); return; }
    if (!password || password.length < 12 || password.includes('CHANGE_')) {
      throw new Error('Set a unique ADMIN_PASSWORD of at least 12 characters for initial setup');
    }
    await pool.query(`INSERT INTO users(id,username,name,password_hash,role) VALUES($1,$2,$3,$4,'admin')`,
      [randomUUID(), process.env.ADMIN_USERNAME || 'admin', process.env.ADMIN_NAME || 'مسؤول النظام', await hashPassword(password)]);
    console.log('Schema initialized. Existing administrator passwords were not changed.');
  } finally { await pool.end(); }
}
main().catch(error => { console.error(error.code || error.message); process.exit(1); });
