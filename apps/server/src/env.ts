import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().url(),
  DB_POOL_SIZE: z.coerce.number().int().min(1).default(10),
  REDIS_URL: z.string().url(),
  CONFIG_BUNDLE_PATH: z.string().min(1),
  WEB_ORIGIN: z.string().url(),
  COOKIE_DOMAIN: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined)),
  COOKIE_SECURE: bool.default('false'),
  TRUST_CF_HEADER: bool.default('false'),
  TURNSTILE_SECRET: z.string().default(''),
  SMTP_URL: z.string().default('smtp://localhost:1025'),
  MAIL_FROM: z.string().default('美味小镇 <noreply@localhost>'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).default(30),
  MIGRATE_ON_START: bool.default('false'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const env = envSchema.parse(source);
  if (env.NODE_ENV === 'production') {
    if (!env.TURNSTILE_SECRET) throw new Error('TURNSTILE_SECRET is required in production');
    if (!env.COOKIE_SECURE) throw new Error('COOKIE_SECURE must be true in production');
  }
  return env;
}
