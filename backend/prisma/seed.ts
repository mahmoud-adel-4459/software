/**
 * Seed CLI: ensures the administrator and (optionally) the demo soldiers.
 *   DATABASE_FILE=path/to/app.db ADMIN_PASSWORD=... npx tsx --tsconfig backend/tsconfig.json backend/prisma/seed.ts [--demo]
 * Reference data (outlets, visitor categories, settings, counters) is created by the first migration.
 */
import { Database } from '../src/config/prisma';
import { ensureAdminUser, seedSampleData } from '../src/seed';

async function main(): Promise<void> {
  const file = process.env.DATABASE_FILE;
  const password = process.env.ADMIN_PASSWORD;
  if (!file) throw new Error('Set DATABASE_FILE');
  const database = new Database(file);
  await database.open();
  try {
    if (password) {
      const created = await ensureAdminUser(database.prisma, {
        username: process.env.ADMIN_USERNAME || 'admin',
        name: process.env.ADMIN_NAME || 'مسؤول النظام',
        password,
      });
      console.log(created ? 'Administrator created.' : 'An active administrator already exists; unchanged.');
    }
    if (process.argv.includes('--demo'))
      console.log((await seedSampleData(database.prisma)) ? 'Demo data added.' : 'Demo data skipped (soldiers exist).');
  } finally {
    await database.close();
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
