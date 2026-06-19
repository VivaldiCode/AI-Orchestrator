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
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// NOTE: this schema mirrors the hand-written SQL migrations (the source of
// truth, because TimescaleDB features can't be expressed here). Keep them in
// sync when evolving the relational tables.

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  // Null for SSO-only accounts (no local password). See identities/oauth_providers.
  passwordHash: text('password_hash'),
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
  // Monthly spend cap (USD). 0 = no budget. Over budget → routing skips it.
  budgetMonthlyUsd: doublePrecision('budget_monthly_usd').notNull().default(0),
  // 'api-key' (static key) or 'subscription' (OAuth device flow, e.g. xAI).
  authMode: text('auth_mode').notNull().default('api-key'),
  // AES-256-GCM ciphertext (v1:iv:tag:ct). Never returned by the API. For
  // subscription providers this also holds the OAuth tokens (access/refresh).
  credentialsEncrypted: text('credentials_encrypted'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Per-model token pricing (USD per 1M tokens). `provider`='ollama' for local. */
export const modelPrices = pgTable(
  'model_prices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    inputPerMtok: doublePrecision('input_per_mtok').notNull().default(0),
    outputPerMtok: doublePrecision('output_per_mtok').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('model_prices_provider_model_idx').on(t.provider, t.model)],
);

export const modelRoutes = pgTable('model_routes', {
  id: uuid('id').primaryKey().defaultRandom(),
  alias: text('alias').notNull().unique(),
  providerId: uuid('provider_id').references(() => providers.id, { onDelete: 'cascade' }),
  providerType: text('provider_type').notNull(),
  targetModel: text('target_model').notNull(),
  enabled: boolean('enabled').notNull().default(true),
});

/**
 * Model equivalence groups: members of one `group_id` are "similar" models
 * across providers, ordered by `position` (proximity). Used to redirect a
 * request to the closest model on another provider when the local cluster
 * can't serve it.
 */
export const modelEquivalents = pgTable(
  'model_equivalents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id').notNull(),
    label: text('label').notNull(),
    providerId: uuid('provider_id').references(() => providers.id, { onDelete: 'set null' }),
    providerType: text('provider_type').notNull(),
    model: text('model').notNull(),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('model_equivalents_group_idx').on(t.groupId)],
);
export type ModelEquivalentRow = typeof modelEquivalents.$inferSelect;

export const oauthProviders = pgTable('oauth_providers', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: text('type').notNull(),
  displayName: text('display_name').notNull(),
  issuer: text('issuer').notNull(),
  clientId: text('client_id').notNull(),
  // AES-256-GCM ciphertext (v1:iv:tag:ct). Never returned by the API.
  clientSecretEncrypted: text('client_secret_encrypted'),
  scopes: jsonb('scopes').notNull().$type<string[]>().default([]),
  enabled: boolean('enabled').notNull().default(true),
  allowedDomains: jsonb('allowed_domains').notNull().$type<string[]>().default([]),
  defaultRole: text('default_role').notNull().default('viewer'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** External identities (OIDC subjects) linked to a local user account. */
export const identities = pgTable(
  'identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => oauthProviders.id, { onDelete: 'cascade' }),
    subject: text('subject').notNull(),
    email: text('email'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('identities_provider_subject_idx').on(t.providerId, t.subject)],
);

export const settings = pgTable('settings', {
  id: smallint('id').primaryKey().default(1),
  strategy: text('strategy').notNull().default('least-connections'),
  modelAware: boolean('model_aware').notNull().default(true),
  contextAware: boolean('context_aware').notNull().default(true),
  autoPull: boolean('auto_pull').notNull().default(false),
  failoverRetries: integer('failover_retries').notNull().default(2),
  triageEnabled: boolean('triage_enabled').notNull().default(false),
  triageModel: text('triage_model').notNull().default(''),
  maxToolCalls: integer('max_tool_calls').notNull().default(5),
  requestLogMax: integer('request_log_max').notNull().default(0),
  cloudOverflow: boolean('cloud_overflow').notNull().default(false),
  cloudOverflowProviderId: text('cloud_overflow_provider_id').notNull().default(''),
  embedOverflow: boolean('embed_overflow').notNull().default(false),
  embedOverflowProviderId: text('embed_overflow_provider_id').notNull().default(''),
  embedOverflowModel: text('embed_overflow_model').notNull().default(''),
  privacyMode: boolean('privacy_mode').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Registered MCP servers (tool providers). Discovered tools cached in `tools`. */
export const mcpServers = pgTable('mcp_servers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  transport: text('transport').notNull().default('http'),
  url: text('url'),
  command: text('command'),
  args: jsonb('args').notNull().$type<string[]>().default([]),
  // AES-256-GCM ciphertext of the HTTP bearer token. Never returned by the API.
  authEncrypted: text('auth_encrypted'),
  enabled: boolean('enabled').notNull().default(true),
  tools: jsonb('tools')
    .notNull()
    .$type<
      { name: string; description: string | null; allowed: boolean; inputSchema?: unknown }[]
    >()
    .default([]),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Reusable task bundles: system prompt + preferred model + MCP tool preset. */
export const skills = pgTable('skills', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  systemPrompt: text('system_prompt').notNull().default(''),
  modelHint: text('model_hint'),
  toolPreset: jsonb('tool_preset').notNull().$type<string[]>().default([]),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
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
    /** The substitute model actually sent upstream when it differs from `model`
     * (e.g. an equivalence-chain target like `grok-2-latest`); null otherwise. */
    targetModel: text('target_model'),
    endpoint: text('endpoint').notNull(),
    status: integer('status').notNull(),
    latencyMs: doublePrecision('latency_ms'),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    totalTokens: integer('total_tokens'),
    costUsd: doublePrecision('cost_usd'),
    error: text('error'),
    clientKeyId: uuid('client_key_id'),
    clientIp: text('client_ip'),
  },
  (t) => [
    index('request_events_node_time_idx').on(t.nodeId, t.time),
    index('request_events_model_time_idx').on(t.model, t.time),
    index('request_events_provider_time_idx').on(t.provider, t.time),
  ],
);

export type NodeRow = typeof nodes.$inferSelect;
export type ProviderRow = typeof providers.$inferSelect;
export type ModelPriceRow = typeof modelPrices.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type OAuthProviderRow = typeof oauthProviders.$inferSelect;
export type IdentityRow = typeof identities.$inferSelect;
export type McpServerRow = typeof mcpServers.$inferSelect;
export type SkillRow = typeof skills.$inferSelect;
export type SettingsRow = typeof settings.$inferSelect;
export type RequestEventRow = typeof requestEvents.$inferInsert;
