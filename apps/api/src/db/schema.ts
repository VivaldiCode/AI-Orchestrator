import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  doublePrecision,
  jsonb,
  smallint,
  index,
} from 'drizzle-orm/pg-core';

// NOTE: this schema mirrors the hand-written SQL migrations (the source of
// truth, because TimescaleDB features can't be expressed here). Keep them in
// sync when evolving the relational tables.

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('admin'),
  /** Optional explicit permission override; null = derive from role. */
  permissions: jsonb('permissions').$type<string[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  prefix: text('prefix').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  scopes: jsonb('scopes').notNull().$type<string[]>().default([]),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const nodes = pgTable('nodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  host: text('host').notNull(),
  port: integer('port').notNull().default(11434),
  protocol: text('protocol').notNull().default('http'),
  weight: integer('weight').notNull().default(1),
  enabled: boolean('enabled').notNull().default(true),
  maxConcurrency: integer('max_concurrency').notNull().default(4),
  tags: jsonb('tags').notNull().$type<string[]>().default([]),
  agentPort: integer('agent_port'),
  enabledModels: jsonb('enabled_models').$type<string[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const providers = pgTable('providers', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  baseUrl: text('base_url'),
  region: text('region'),
  defaultModel: text('default_model'),
  // AES-256-GCM ciphertext (v1:iv:tag:ct). Never returned by the API.
  credentialsEncrypted: text('credentials_encrypted'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const modelRoutes = pgTable('model_routes', {
  id: uuid('id').primaryKey().defaultRandom(),
  alias: text('alias').notNull().unique(),
  providerId: uuid('provider_id').references(() => providers.id, { onDelete: 'cascade' }),
  providerType: text('provider_type').notNull(),
  targetModel: text('target_model').notNull(),
  enabled: boolean('enabled').notNull().default(true),
});

export const settings = pgTable('settings', {
  id: smallint('id').primaryKey().default(1),
  strategy: text('strategy').notNull().default('least-connections'),
  modelAware: boolean('model_aware').notNull().default(true),
  contextAware: boolean('context_aware').notNull().default(true),
  autoPull: boolean('auto_pull').notNull().default(false),
  failoverRetries: integer('failover_retries').notNull().default(2),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Time-series of every proxied request. Converted to a TimescaleDB hypertable
 * in the migration. No surrogate primary key (hypertables partition on `time`).
 */
export const requestEvents = pgTable(
  'request_events',
  {
    time: timestamp('time', { withTimezone: true }).notNull().defaultNow(),
    requestId: text('request_id').notNull(),
    nodeId: uuid('node_id'),
    provider: text('provider').notNull().default('ollama'),
    model: text('model').notNull().default(''),
    endpoint: text('endpoint').notNull(),
    status: integer('status').notNull(),
    latencyMs: doublePrecision('latency_ms'),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    totalTokens: integer('total_tokens'),
    error: text('error'),
    clientKeyId: uuid('client_key_id'),
  },
  (t) => [
    index('request_events_node_time_idx').on(t.nodeId, t.time),
    index('request_events_model_time_idx').on(t.model, t.time),
    index('request_events_provider_time_idx').on(t.provider, t.time),
  ],
);

export type NodeRow = typeof nodes.$inferSelect;
export type ProviderRow = typeof providers.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type SettingsRow = typeof settings.$inferSelect;
export type RequestEventRow = typeof requestEvents.$inferInsert;
