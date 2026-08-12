import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(8080),
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017'),
  PLATFORM_DB_NAME: z.string().min(1).default('sa_platform'),
  TENANT_DB_PREFIX: z.string().min(1).default('sa_tenant_'),
  JWT_ACCESS_SECRET: z.string().min(16).default('dev-only-access-secret-change-me'),
  JWT_REFRESH_SECRET: z.string().min(16).default('dev-only-refresh-secret-change-me'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(30),
  APP_ROOT_DOMAIN: z.string().default('scoreassign.com'),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  EXTRA_CORS_ORIGINS: z.string().default(''),
  BILLING_PROVIDER: z.enum(['stub']).default('stub'),
  ANNUAL_PRICE_CENTS: z.coerce.number().int().default(9600),
  TRIAL_DAYS: z.coerce.number().int().default(7),
  EMAIL_PROVIDER: z.enum(['log']).default('log'),
  EMAIL_FROM: z.string().default('no-reply@scoreassign.com'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

const env = parsed.data;

export const config = {
  ...env,
  isProduction: env.NODE_ENV === 'production',
  corsOrigins: [
    env.WEB_ORIGIN,
    ...env.EXTRA_CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  ],
};

/**
 * Secrets must never fall back to development defaults in production, or a
 * misconfigured deploy would silently ship a forgeable token signer.
 */
if (config.isProduction) {
  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    if (config[key].startsWith('dev-only-')) {
      throw new Error(`${key} must be set to a real secret in production`);
    }
  }
}

export type Config = typeof config;
