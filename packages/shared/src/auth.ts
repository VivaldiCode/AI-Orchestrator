import { z } from 'zod';

export const roleSchema = z.enum(['admin', 'editor', 'viewer']);
export type Role = z.infer<typeof roleSchema>;

/**
 * Fine-grained feature permissions (RBAC). Routes are gated on these; a user's
 * effective set comes from their role's defaults unless explicitly overridden.
 */
export const permissionSchema = z.enum([
  'nodes:read',
  'nodes:write',
  'providers:read',
  'providers:write',
  'analytics:read',
  'apikeys:read',
  'apikeys:write',
  'settings:read',
  'settings:write',
  'users:read',
  'users:write',
]);
export type Permission = z.infer<typeof permissionSchema>;

/** Every known permission, in display order. */
export const PERMISSIONS: readonly Permission[] = permissionSchema.options;

/** Default permission set granted by each role. `admin` = everything. */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  viewer: ['nodes:read', 'providers:read', 'analytics:read', 'apikeys:read', 'settings:read'],
  editor: [
    'nodes:read',
    'nodes:write',
    'providers:read',
    'providers:write',
    'analytics:read',
    'apikeys:read',
    'apikeys:write',
    'settings:read',
    'settings:write',
  ],
  admin: [...permissionSchema.options],
};

/** Effective permissions = explicit override (if any), else the role defaults. */
export function effectivePermissions(role: Role, override?: Permission[] | null): Permission[] {
  return override && override.length > 0 ? override : ROLE_PERMISSIONS[role];
}

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
  /** Effective permissions, resolved from role + override; served to the client. */
  permissions: z.array(permissionSchema),
  createdAt: z.string(),
});
export type User = z.infer<typeof userSchema>;

/** Payload to create a user. Defaults to a full-permission admin for now. */
export const createUserSchema = z.object({
  username: credentialsSchema.shape.username,
  password: credentialsSchema.shape.password,
  role: roleSchema.default('admin'),
  /** Optional explicit permission override; null = derive from role. */
  permissions: z.array(permissionSchema).nullable().default(null),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

/** Partial update of a user (PATCH). Username is immutable. */
export const updateUserSchema = z
  .object({
    role: roleSchema,
    permissions: z.array(permissionSchema).nullable(),
    password: credentialsSchema.shape.password,
  })
  .partial();
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

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
