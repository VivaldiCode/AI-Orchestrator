import { z } from 'zod';

export const roleSchema = z.enum(['admin', 'viewer']);
export type Role = z.infer<typeof roleSchema>;

/** Username + password used for first-run setup and login. */
export const credentialsSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/, 'only letters, numbers, dot, underscore and dash'),
  // Minimum 12 chars — see SECURITY.md hardening guidance.
  password: z.string().min(12).max(200),
});
export type Credentials = z.infer<typeof credentialsSchema>;

export const setupSchema = credentialsSchema;
export const loginSchema = credentialsSchema;

export const userSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  role: roleSchema,
  createdAt: z.string(),
});
export type User = z.infer<typeof userSchema>;

export const tokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int(),
});
export type TokenPair = z.infer<typeof tokenPairSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

/** Whether the instance still needs its first admin created. */
export const setupStatusSchema = z.object({ needsSetup: z.boolean() });
export type SetupStatus = z.infer<typeof setupStatusSchema>;

// --- API keys (for inference clients) --------------------------------------

export const apiKeyScopeSchema = z.enum(['inference', 'admin']);
export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>;

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(apiKeyScopeSchema).min(1).default(['inference']),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

export const apiKeySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** Non-secret identifying prefix, e.g. `aio_live_ab12cd`. */
  prefix: z.string(),
  scopes: z.array(apiKeyScopeSchema),
  lastUsedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type ApiKey = z.infer<typeof apiKeySchema>;

/** Returned ONCE at creation — the full secret is never retrievable again. */
export const apiKeyCreatedSchema = apiKeySchema.extend({
  secret: z.string(),
});
export type ApiKeyCreated = z.infer<typeof apiKeyCreatedSchema>;
