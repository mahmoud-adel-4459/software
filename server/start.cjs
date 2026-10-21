'use strict';
const https = require('node:https');
const fs = require('node:fs');
const { Pool } = require('pg');
const { Store } = require('./store.cjs');
const { createHandler } = require('./api.cjs');
const { fileLicenseProvider } = require('./licensing.cjs');
const { BackupManager, mergeBackupPolicy } = require('./backup.cjs');
const {serverFingerprint}=require('./identity.cjs');

async function main() {
  for (const key of ['DATABASE_URL', 'SERVER_ID', 'LICENSE_PUBLIC_KEY', 'LICENSE_FILE', 'TLS_CERT', 'TLS_KEY']) {
    if (!process.env[key] || process.env[key].includes('CHANGE_')) throw new Error(`Configure ${key} in .env first`);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  pool.on('error', e => console.error('Database connection failure:', e.code || e.name));
  const store = new Store(pool);
  const migration = await store.pool.query('SELECT version FROM schema_migrations WHERE version=4');
  if (migration.rows.length !== 1) throw new Error('Run server:init before starting the service');
  const provider = fileLicenseProvider(process.env.LICENSE_PUBLIC_KEY, process.env.LICENSE_FILE, process.env.SERVER_ID,serverFingerprint(process.env.SERVER_ID));
  provider(); // Fail closed before listening when the installation is not licensed.
  const backupManager=process.env.BACKUP_KEY_HEX&&process.env.BACKUP_DIRECTORY?new BackupManager({store,key:process.env.BACKUP_KEY_HEX,serverId:process.env.SERVER_ID,directory:process.env.BACKUP_DIRECTORY,retentionDays:Number(process.env.BACKUP_RETENTION_DAYS||30)}):undefined;
  const handler=createHandler({ store, licenseProvider: provider,backupManager });
  if(backupManager)backupManager.startSchedule({
    loadPolicy:async()=>{const row=(await store.pool.query('SELECT data FROM settings WHERE id=1')).rows[0];return mergeBackupPolicy(row?.data);},
    isBusy:()=>handler.getActiveRequestCount()>0,
  });
  const server = https.createServer({ cert: fs.readFileSync(process.env.TLS_CERT), key: fs.readFileSync(process.env.TLS_KEY), minVersion: 'TLSv1.2' },handler);
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.listen(Number(process.env.PORT || 8443), process.env.HOST || '127.0.0.1', () => console.log('Military Affairs HTTPS service ready'));
  function shutdown() { server.close(() => pool.end().then(() => process.exit(0))); setTimeout(() => process.exit(1), 10000).unref(); }
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
}
main().catch(error => { console.error('Server startup failed:', error.code || error.message); process.exit(1); });
