// Bundles the backend into backend/dist (CommonJS) for Electron / standalone use.
// Dependencies (express, zod, prisma, better-sqlite3 ...) stay external and are resolved from node_modules.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: {
    index: path.join(root, 'src/index.ts'),
    server: path.join(root, 'src/server.ts'),
    migrate: path.join(root, 'scripts/migrate-pglite-to-sqlite.ts'),
  },
  outdir: path.join(root, 'dist'),
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  packages: 'external',
  sourcemap: true,
  tsconfig: path.join(root, 'tsconfig.json'),
  logLevel: 'info',
});
