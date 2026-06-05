import { z } from 'zod';

/**
 * Parse a boolean from an environment string. We cannot use `z.coerce.boolean()`
 * because `Boolean("false")` is `true`.
 */
const boolFromEnv = (def: boolean) =>
  z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((v) => {
      if (typeof v === 'boolean') return v;
      if (v == null || v === '') return def;
      return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
    });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(11435),
  TRUST_PROXY: boolFromEnv(false),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).default(300000),

  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgres://orchestrator:orchestrator@localhost:5432/orchestrator'),

  ORCHESTRATOR_MASTER_KEY: z.string().min(16).optional(),
  JWT_SECRET: z.string().min(16).optional(),
  JWT_ACCESS_TTL: z.coerce.number().int().min(60).default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().min(300).default(2592000),

  DASHBOARD_ORIGIN: z.string().default('http://localhost:8080,http://localhost:5173'),
  // Externally reachable base URL, used to build OAuth redirect URIs.
  PUBLIC_BASE_URL: z.string().default('http://localhost:8080'),

  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(600),
  RATE_LIMIT_WINDOW: z.coerce.number().int().min(1000).default(60000),

  DEFAULT_STRATEGY: z
    .enum(['round-robin', 'weighted', 'least-connections', 'least-latency'])
    .default('least-connections'),
  HEALTHCHECK_INTERVAL_MS: z.coerce.number().int().min(1000).default(10000),
  HEALTHCHECK_TIMEOUT_MS: z.coerce.number().int().min(500).default(3000),
  NODE_FAILOVER_RETRIES: z.coerce.number().int().min(0).max(10).default(2),
  NODE_AGENT_TOKEN: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error(
    '[config] Invalid environment configuration:\n',
    JSON.stringify(parsed.error.issues, null, 2),
  );
  throw new Error('Invalid environment configuration');
}
const env = parsed.data;

const isProd = env.NODE_ENV === 'production';
const isTest = env.NODE_ENV === 'test';
const isDev = env.NODE_ENV === 'development';

const DEV_MASTER_KEY = 'dev-only-insecure-master-key-change-me-please';
const DEV_JWT_SECRET = 'dev-only-insecure-jwt-secret-change-me-please';

function requireSecret(name: string, value: string | undefined, devFallback: string): string {
  if (value && value.length >= 16) return value;
  if (isProd) {
    throw new Error(`${name} must be set to a strong value (>=16 chars) in production.`);
  }
  console.warn(
    `[config] ${name} not set — using an INSECURE development default. Never use this in production.`,
  );
  return devFallback;
}

export const config = {
  env: env.NODE_ENV,
  isProd,
  isTest,
  isDev,
  logLevel: env.LOG_LEVEL,
  host: env.API_HOST,
  port: env.API_PORT,
  trustProxy: env.TRUST_PROXY,
  requestTimeoutMs: env.REQUEST_TIMEOUT_MS,
  databaseUrl: env.DATABASE_URL,
  masterKey: requireSecret('ORCHESTRATOR_MASTER_KEY', env.ORCHESTRATOR_MASTER_KEY, DEV_MASTER_KEY),
  jwtSecret: requireSecret('JWT_SECRET', env.JWT_SECRET, DEV_JWT_SECRET),
  jwtAccessTtl: env.JWT_ACCESS_TTL,
  jwtRefreshTtl: env.JWT_REFRESH_TTL,
  dashboardOrigins: env.DASHBOARD_ORIGIN.split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  publicBaseUrl: env.PUBLIC_BASE_URL.replace(/\/+$/, ''),
  rateLimitMax: env.RATE_LIMIT_MAX,
  rateLimitWindow: env.RATE_LIMIT_WINDOW,
  defaultStrategy: env.DEFAULT_STRATEGY,
  healthcheckIntervalMs: env.HEALTHCHECK_INTERVAL_MS,
  healthcheckTimeoutMs: env.HEALTHCHECK_TIMEOUT_MS,
  failoverRetries: env.NODE_FAILOVER_RETRIES,
  nodeAgentToken: env.NODE_AGENT_TOKEN ?? '',
} as const;

export type Config = typeof config;
