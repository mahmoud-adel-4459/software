'use strict';
/**
 * Offline internal HTTPS API on this Windows PC: the TypeScript backend (backend/dist) on a SQLite
 * file under userData. Replaces the former PostgreSQL/PGlite server.
 */
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { ensureStandalone, ensureBackupKey } = require('./standalone-bootstrap.cjs');

/** Electron needs its own build of better-sqlite3 (see scripts/build-native-electron.cjs). */
function configureNativeBinding() {
  if (process.env.SQLITE_NATIVE_BINDING) return;
  const candidates = [
    path.join(process.resourcesPath || '', 'native', 'better_sqlite3.node'),
    path.join(__dirname, '../native/electron/better_sqlite3.node'),
  ];
  const found = candidates.find((file) => fs.existsSync(file));
  if (found) process.env.SQLITE_NATIVE_BINDING = found;
}

/** First run after the upgrade: bring the old PGlite database over, verified row by row. */
async function migrateLegacyDatabase(boot, backend) {
  if (fs.existsSync(boot.dbFile) || !fs.existsSync(path.join(boot.legacyDbDir, 'PG_VERSION'))) return;
  const { migratePglite } = require(path.join(backend, 'dist/migrate.cjs'));
  const result = await migratePglite({ source: boot.legacyDbDir, target: boot.dbFile });
  if (!result.ok) throw new Error('فشل ترحيل قاعدة البيانات القديمة؛ لم تُعدَّل البيانات الأصلية');
}

/**
 * @param {{ userDataDir: string, host?: string, port?: number, playMode?: boolean }} opts
 */
async function startEmbeddedServer({ userDataDir, host = '127.0.0.1', port = 8443, playMode = false }) {
  configureNativeBinding();
  const backendRoot = path.join(__dirname, '../backend');
  const boot = ensureStandalone(userDataDir, { playMode });
  await migrateLegacyDatabase(boot, backendRoot);

  const devices = [boot.devices.internal, boot.devices.gate].map(({ privateKey: _privateKey, ...device }) => device);
  const { createBackend } = require(path.join(backendRoot, 'dist/index.cjs'));
  const backend = await createBackend({
    dbPath: boot.dbFile,
    serverId: boot.meta.serverId,
    licenseProvider: () => ({ installation: 'خادم محلي — Windows', serverId: boot.meta.serverId, devices }),
    backupKeyHex: ensureBackupKey(boot.root),
    backupDirectory: path.join(boot.root, 'backups'),
    admin: { username: boot.meta.adminUsername, name: boot.meta.adminName, password: boot.meta.adminPassword },
    seedDemo: true,
  });
  backend.start();

  const server = https.createServer(
    { cert: fs.readFileSync(boot.certPath), key: fs.readFileSync(boot.keyPath), minVersion: 'TLSv1.2' },
    backend.handler,
  );

  let listenPort = port;
  await new Promise((resolve, reject) => {
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && listenPort === port) {
        listenPort = port + 1;
        server.listen(listenPort, host, resolve);
        return;
      }
      reject(err);
    });
    server.listen(listenPort, host, resolve);
  });

  return {
    origin: `https://${host === '0.0.0.0' ? '127.0.0.1' : host}:${listenPort}`,
    ca: boot.ca,
    loginPath: boot.loginPath,
    async shutdown() {
      await new Promise((resolve) => server.close(resolve));
      await backend.shutdown();
    },
  };
}

module.exports = { startEmbeddedServer };
