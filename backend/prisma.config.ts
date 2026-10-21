import { defineConfig } from 'prisma/config';

// Used only by the Prisma CLI (generate / migrate diff). Runtime opens the DB itself (src/config/prisma.ts).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? 'file:./dev.db' },
});
