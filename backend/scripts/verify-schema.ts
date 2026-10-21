/**
 * Verifies that applying prisma/migrations produces exactly the schema.prisma model
 * (`prisma migrate diff --exit-code` against a scratch database). Exit code 0 = no difference.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyMigrations } from '@/config/migrator';
import { openRaw } from '@/config/prisma';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-check-'));
const file = path.join(dir, 'check.db');
const raw = openRaw(file);
applyMigrations(raw);
raw.close();

const backendRoot = path.resolve(__dirname, '..');
const result = spawnSync(
  process.execPath,
  [
    require.resolve('prisma/build/index.js'),
    'migrate',
    'diff',
    '--config',
    path.join(backendRoot, 'prisma.config.ts'),
    '--from-config-datasource',
    '--to-schema',
    path.join(backendRoot, 'prisma/schema.prisma'),
    '--exit-code',
  ],
  { env: { ...process.env, DATABASE_URL: `file:${file.replaceAll('\\', '/')}` }, encoding: 'utf8' },
);
fs.rmSync(dir, { recursive: true, force: true });
const output = `${result.stdout}${result.stderr}`.replace(/[┌└│][^\n]*\n?/g, '');
console.log(output.trim());
console.log(result.status === 0 ? 'SCHEMA OK: migrations == schema.prisma' : 'SCHEMA DRIFT detected');
process.exit(result.status === 0 ? 0 : 1);
