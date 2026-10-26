import fs from 'node:fs';
import https from 'node:https';
import { createBackend } from '@/index';
import { loadEnv } from '@/config/env';

/** Standalone HTTPS service (LAN mode): same API as the embedded one, SQLite file on this machine. */
async function main(): Promise<void> {
  const env = loadEnv();
  const backend = await createBackend({
    dbPath: env.DATABASE_FILE,
    serverId: env.SERVER_ID,
    ...(env.BACKUP_KEY_HEX && env.BACKUP_DIRECTORY
      ? { backupKeyHex: env.BACKUP_KEY_HEX, backupDirectory: env.BACKUP_DIRECTORY }
      : {}),
    backupRetentionDays: env.BACKUP_RETENTION_DAYS,
    ...(env.ADMIN_PASSWORD
      ? { admin: { username: env.ADMIN_USERNAME, name: env.ADMIN_NAME, password: env.ADMIN_PASSWORD } }
      : {}),
  });
  backend.start();
  const server = https.createServer(
    { cert: fs.readFileSync(env.TLS_CERT), key: fs.readFileSync(env.TLS_KEY), minVersion: 'TLSv1.2' },
    backend.handler,
  );
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.listen(env.PORT, env.HOST, () => console.log('Military Affairs HTTPS service ready'));

  const shutdown = () => {
    server.close(() => void backend.shutdown().then(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: { code?: string; message?: string }) => {
  console.error('Server startup failed:', error.code || error.message);
  process.exit(1);
});
