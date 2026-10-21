import { z } from 'zod';

z.config(z.locales.ar());

const required = (name: string) =>
  z
    .string({ error: `المتغير ${name} مطلوب` })
    .min(1, `المتغير ${name} مطلوب`)
    .refine((v) => !v.includes('CHANGE_'), `اضبط ${name} في ملف .env أولًا`);

const schema = z.object({
  DATABASE_FILE: required('DATABASE_FILE'),
  SERVER_ID: required('SERVER_ID'),
  LICENSE_PUBLIC_KEY: required('LICENSE_PUBLIC_KEY'),
  LICENSE_FILE: required('LICENSE_FILE'),
  TLS_CERT: required('TLS_CERT'),
  TLS_KEY: required('TLS_KEY'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8443),
  HOST: z.string().default('127.0.0.1'),
  BACKUP_KEY_HEX: z
    .string()
    .regex(/^[0-9a-f]{64}$/i)
    .optional(),
  BACKUP_DIRECTORY: z.string().optional(),
  BACKUP_RETENTION_DAYS: z.coerce.number().int().min(7).max(365).default(30),
  ADMIN_USERNAME: z.string().default('admin'),
  ADMIN_NAME: z.string().default('مسؤول النظام'),
  ADMIN_PASSWORD: z.string().min(12).optional(),
});

export type Env = z.infer<typeof schema>;

/** Validates the process environment of the standalone server (same variables as the legacy server/start.cjs). */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }
  return parsed.data;
}
