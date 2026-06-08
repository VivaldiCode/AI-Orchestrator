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
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Provider = z.infer<typeof providerSchema>;

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
