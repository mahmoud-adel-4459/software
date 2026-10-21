'use strict';
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { Store } = require('../server/store.cjs');
const { createHandler } = require('../server/api.cjs');
const { createPool } = require('./pglite-data-pool.cjs');
const { ensureStandalone, ensureAdminUser, ensureBackupKey } = require('./standalone-bootstrap.cjs');
const { BackupManager, mergeBackupPolicy } = require('../server/backup.cjs');
const { seedSampleData } = require('../scripts/lab-sample-data.cjs');

/**
 * Offline internal HTTPS API on this Windows PC (persistent PGlite under userData).
 * @param {{ userDataDir: string, host?: string, port?: number }} opts
 */
async function startEmbeddedServer({ userDataDir, host = '127.0.0.1', port = 8443, playMode = false }) {
  const boot = ensureStandalone(userDataDir, { playMode });
  const pool = await createPool(boot.dbDir);
  const store = new Store(pool);
  await store.migrate();
  await ensureAdminUser(pool, boot.meta);
  await seedSampleData(pool);

  const devices = [boot.devices.internal, boot.devices.gate].map(({ privateKey, ...d }) => d);
  const licenseProvider = () => ({
    installation: 'خادم محلي — Windows',
    serverId: boot.meta.serverId,
    devices,
  });

  const backupDir = path.join(boot.root, 'backups');
  const backupKey = ensureBackupKey(boot.root);
  const backupManager = new BackupManager({
    store,
    key: backupKey,
    serverId: boot.meta.serverId,
    directory: backupDir,
    retentionDays: mergeBackupPolicy({}).backupRetentionDays,
  });
  const api = createHandler({ store, licenseProvider, backupManager });
  backupManager.startSchedule({
    loadPolicy: async () => {
      const row = (await store.pool.query('SELECT data FROM settings WHERE id=1')).rows[0];
      return mergeBackupPolicy(row?.data);
    },
    isBusy: () => api.getActiveRequestCount() > 0,
  });
  const server = https.createServer({
    cert: fs.readFileSync(boot.certPath),
    key: fs.readFileSync(boot.keyPath),
    minVersion: 'TLSv1.2',
  }, (req, res) => api(req, res));

  let listenPort = port;
  await new Promise((resolve, reject) => {
    server.on('error', err => {
      if (err.code === 'EADDRINUSE' && listenPort === port) {
        listenPort = port + 1;
        server.listen(listenPort, host, resolve);
        return;
      }
      reject(err);
    });
    server.listen(listenPort, host, resolve);
  });

  const origin = `https://${host === '0.0.0.0' ? '127.0.0.1' : host}:${listenPort}`;
  return {
    origin,
    ca: boot.ca,
    loginPath: boot.loginPath,
    async shutdown() {
      backupManager.stopSchedule();
      await new Promise(resolve => server.close(resolve));
      await pool.end();
    },
  };
}

module.exports = { startEmbeddedServer };
