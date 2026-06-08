import { z } from 'zod';

/**
 * Supported provider kinds.
 * - `ollama`           the local cluster of Ollama nodes (managed via /nodes)
 * - `openai`/`xai`     OpenAI-compatible HTTP APIs
 * - `anthropic`        Anthropic Messages API (official SDK)
 * - `bedrock`          Amazon Bedrock (AWS SDK)
 * - `openai-compatible` any self-hosted OpenAI-compatible endpoint
 */
export const providerTypeSchema = z.enum([
  'ollama',
  'openai',
  'anthropic',
  'xai',
  'bedrock',
  'google',
  'mistral',
  'openai-compatible',
]);
export type ProviderType = z.infer<typeof providerTypeSchema>;

const providerFields = {
  type: providerTypeSchema,
  name: z.string().min(1).max(100),
  enabled: z.boolean(),
  baseUrl: z.url().max(2048).optional(),
  region: z.string().max(64).optional(),
  defaultModel: z.string().max(200).optional(),
  /** Monthly spend cap (USD). 0 = no budget. Over budget → routing skips it. */
  budgetMonthlyUsd: z.number().min(0).max(1_000_000).optional(),
  /**
   * How the provider authenticates:
   * - `api-key`      a static API key / access key (default)
   * - `subscription` OAuth device-flow login (e.g. xAI SuperGrok). Tokens are
   *                  obtained via the device endpoints, not by pasting a key.
   */
  authMode: z.enum(['api-key', 'subscription']).optional(),
};

/** Create payload — `apiKey` is write-only and is encrypted at rest. */
export const createProviderSchema = z.object({
  ...providerFields,
  enabled: providerFields.enabled.default(true),
  apiKey: z.string().min(1).max(4096).optional(),
  // Bedrock uses access key + secret instead of a single token.
  accessKeyId: z.string().min(1).max(256).optional(),
  secretAccessKey: z.string().min(1).max(256).optional(),
});
export type CreateProviderInput = z.infer<typeof createProviderSchema>;

export const updateProviderSchema = createProviderSchema.partial();
export type UpdateProviderInput = z.infer<typeof updateProviderSchema>;

/** Provider as returned by the API — never includes secrets. */
export const providerSchema = z.object({
  id: z.uuid(),
  type: providerTypeSchema,
  name: z.string(),
  enabled: z.boolean(),
  baseUrl: z.string().nullable(),
  region: z.string().nullable(),
  defaultModel: z.string().nullable(),
  /** Whether credentials are stored (the secret value itself is never returned). */
  hasCredentials: z.boolean(),
  /** Monthly budget (USD); 0 = none. */
  budgetMonthlyUsd: z.number(),
  /** Spend so far this calendar month (USD), computed from analytics. */
  spentThisMonthUsd: z.number(),
  /** How the provider authenticates. */
  authMode: z.enum(['api-key', 'subscription']),
  /**
   * Subscription (OAuth) connection status — `null` for `api-key` providers.
   * Never includes the tokens themselves.
   */
  subscription: z
    .object({
      connected: z.boolean(),
      expiresAt: z.string().nullable(),
      scope: z.string().nullable(),
      account: z.string().nullable(),
    })
    .nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Provider = z.infer<typeof providerSchema>;

/** Public response from starting the xAI subscription device-login flow. */
export const deviceLoginSchema = z.object({
  userCode: z.string(),
  verificationUri: z.string(),
  verificationUriComplete: z.string().nullable(),
  expiresInSeconds: z.number(),
  intervalSeconds: z.number(),
});
export type DeviceLogin = z.infer<typeof deviceLoginSchema>;

/** Public response from polling the device-login flow. */
export const devicePollSchema = z.object({
  status: z.enum(['pending', 'connected', 'denied', 'expired', 'error']),
  expiresAt: z.string().nullable().optional(),
  account: z.string().nullable().optional(),
  message: z.string().optional(),
});
export type DevicePoll = z.infer<typeof devicePollSchema>;

/** An entry in the logical model registry: a public model name → provider+model. */
export const modelRouteSchema = z.object({
  id: z.uuid(),
  alias: z.string().min(1).max(200),
  providerId: z.uuid().nullable(),
  providerType: providerTypeSchema,
  targetModel: z.string().min(1).max(200),
  enabled: z.boolean(),
});
export type ModelRoute = z.infer<typeof modelRouteSchema>;

export const createModelRouteSchema = z.object({
  alias: z.string().min(1).max(200),
  providerId: z.uuid().nullable().optional(),
  providerType: providerTypeSchema,
  targetModel: z.string().min(1).max(200),
  enabled: z.boolean().default(true),
});
export type CreateModelRouteInput = z.infer<typeof createModelRouteSchema>;
