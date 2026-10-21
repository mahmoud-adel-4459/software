'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const root = path.join(__dirname, '..');

function need(key) {
  const v = process.env[key];
  if (!v || v.includes('CHANGE_')) throw new Error(`Configure ${key} in .env`);
  return v;
}

async function main() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) throw new Error('Missing .env — copy from .env.example');
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  for (const key of ['DATABASE_URL', 'SERVER_ID', 'LICENSE_PUBLIC_KEY', 'LICENSE_FILE', 'TLS_CERT', 'TLS_KEY']) {
    need(key);
    const p = process.env[key].replace(/^private\//, '');
    if (key.includes('TLS') || key.includes('LICENSE') || key.includes('PUBLIC')) {
      const full = path.isAbsolute(process.env[key]) ? process.env[key] : path.join(root, process.env[key]);
      if (!fs.existsSync(full)) throw new Error(`Missing file: ${full}`);
    }
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
  try {
    const mig = await pool.query('SELECT version FROM schema_migrations WHERE version=4');
    if (mig.rows.length !== 1) throw new Error('Schema not at migration 4 — run server:init');
    console.log('Preflight OK: env, files, database migration 4');
  } finally {
    await pool.end();
  }
}

main().catch(e => { console.error('Preflight failed:', e.message); process.exit(1); });
