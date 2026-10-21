'use strict';
// Lab HTTPS server (PGlite in-memory). Not for production.
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { randomUUID } = require('node:crypto');
const { createPool } = require('../tests/pglite-pool.cjs');
const { Store } = require('../server/store.cjs');
const { createHandler } = require('../server/api.cjs');
const { fileLicenseProvider } = require('../server/licensing.cjs');
const { serverFingerprint } = require('../server/identity.cjs');
const { hashPassword } = require('../shared/crypto.cjs');
const { seedSampleData } = require('./lab-sample-data.cjs');

const root = path.resolve(__dirname, '..');

function envPath(key) {
  const rel = process.env[key];
  if (!rel || rel.includes('CHANGE_')) throw new Error(`Configure ${key} in .env (run npm.cmd run lab:setup)`);
  return path.isAbsolute(rel) ? rel : path.join(root, rel);
}

async function ensureAdmin(pool) {
  const existing = await pool.query("SELECT id FROM users WHERE role='admin' AND disabled=false LIMIT 1");
  if (existing.rows.length) return;
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 12) throw new Error('Set ADMIN_PASSWORD (12+ chars) in .env');
  await pool.query('INSERT INTO users(id,username,name,password_hash,role) VALUES($1,$2,$3,$4,$5)',
    [randomUUID(), process.env.ADMIN_USERNAME || 'admin', process.env.ADMIN_NAME || 'مسؤول', await hashPassword(password), 'admin']);
  console.log('Lab database: administrator account created.');
}

async function main() {
  const serverId = process.env.SERVER_ID;
  if (!serverId) throw new Error('Missing SERVER_ID');
  const pool = await createPool();
  const store = new Store(pool);
  await store.migrate();
  await ensureAdmin(pool);
  if (await seedSampleData(pool)) console.log('Lab: 3 demo soldiers loaded (e.g. military no 000012345).');
  const provider = fileLicenseProvider(envPath('LICENSE_PUBLIC_KEY'), envPath('LICENSE_FILE'), serverId, serverFingerprint(serverId));
  provider();
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 8443);
  const api = createHandler({ store, licenseProvider: provider });
  const labHelp = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>خادم شؤون العسكريين</title>
<style>body{font-family:Segoe UI,Tahoma,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1.5rem;line-height:1.6;color:#1a1a1a}code{background:#f0f0f0;padding:.15rem .4rem;border-radius:4px}h1{font-size:1.25rem}</style></head><body>
<h1>هذا عنوان الخادم (API) — وليس واجهة التطبيق</h1>
<p>الشاشة البيضاء طبيعية هنا. لاستخدام النظام والطباعة:</p>
<ol>
<li>اترك هذه الطرفية تعمل (<code>npm.cmd run lab:server</code>).</li>
<li>افتح تطبيق Electron:<br><code>npm.cmd run lab:start</code><br>أو<br><code>Military Affairs.exe --lab</code></li>
<li>سجّل الدخول بـ <code>admin</code> وكلمة المرور من <code>private\\lab-login.txt</code>.</li>
</ol>
<p>معاينة المتصفح (بدون Electron): <code>npm.cmd run preview:local</code> — منفذ مختلف، لا تستخدم :8443.</p>
</body></html>`;
  const server = https.createServer({
    cert: fs.readFileSync(envPath('TLS_CERT')),
    key: fs.readFileSync(envPath('TLS_KEY')),
    minVersion: 'TLSv1.2',
  }, (req, res) => {
    const url = new URL(req.url, 'https://127.0.0.1');
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(labHelp);
      return;
    }
    return api(req, res);
  });
  server.listen(port, host, () => {
    console.log(`Lab HTTPS service ready at https://${host}:${port} (in-memory DB; stops when you close this terminal)`);
  });
  const shutdown = () => { server.close(() => pool.end().then(() => process.exit(0))); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(error => { console.error('Lab server failed:', error.message); process.exit(1); });
