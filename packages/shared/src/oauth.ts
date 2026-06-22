import { z } from 'zod';
import { roleSchema } from './auth';

/**
 * Supported OAuth 2.0 / OIDC provider kinds. `oidc` is any spec-compliant
 * issuer; the named ones only differ in default scopes and branding — all are
 * driven by the issuer's `/.well-known/openid-configuration` discovery document.
 */
export const oauthProviderTypeSchema = z.enum(['google', 'microsoft', 'okta', 'oidc']);
export type OAuthProviderType = z.infer<typeof oauthProviderTypeSchema>;

/** Reusable field validators shared by create/update/read schemas. */
const providerFields = {
  type: oauthProviderTypeSchema,
  displayName: z.string().min(1).max(100),
  /** Base issuer URL, e.g. `https://accounts.google.com`. Discovery is derived from it. */
  issuer: z.url().max(500),
  clientId: z.string().min(1).max(500),
  scopes: z.array(z.string().min(1).max(100)).max(20),
  enabled: z.boolean(),
  /** Email-domain allowlist (e.g. `acme.com`); empty = any verified email accepted. */
  allowedDomains: z.array(z.string().min(1).max(255)).max(50),
  /** Role granted to users provisioned on first SSO login. */
  defaultRole: roleSchema,
  /**
   * Require the IdP to assert a verified email (`email_verified`) before sign-in.
   * Keep on for public IdPs (Google/Microsoft); turn off only for a trusted
   * self-hosted IdP (e.g. Pocket-ID) that manages emails but doesn't verify them.
   */
  requireVerifiedEmail: z.boolean(),
};

/** Payload to register a provider. `clientSecret` only travels inbound. */
export const createOAuthProviderSchema = z.object({
  ...providerFields,
  clientSecret: z.string().min(1).max(1000),
  scopes: providerFields.scopes.default(['openid', 'email', 'profile']),
  enabled: providerFields.enabled.default(true),
  allowedDomains: providerFields.allowedDomains.default([]),
  defaultRole: providerFields.defaultRole.default('viewer'),
  requireVerifiedEmail: providerFields.requireVerifiedEmail.default(true),
});
export type CreateOAuthProviderInput = z.infer<typeof createOAuthProviderSchema>;

/** Partial update (PATCH). A present `clientSecret` rotates the stored secret. */
export const updateOAuthProviderSchema = z
  .object({ ...providerFields, clientSecret: z.string().min(1).max(1000) })
  .partial();
export type UpdateOAuthProviderInput = z.infer<typeof updateOAuthProviderSchema>;

/** Provider as returned to admins. Never includes the secret (only whether one is set). */
export const oauthProviderSchema = z.object({
  id: z.uuid(),
  type: providerFields.type,
  displayName: providerFields.displayName,
  issuer: providerFields.issuer,
  clientId: providerFields.clientId,
  scopes: providerFields.scopes,
  enabled: providerFields.enabled,
  allowedDomains: providerFields.allowedDomains,
  defaultRole: providerFields.defaultRole,
  requireVerifiedEmail: providerFields.requireVerifiedEmail,
  hasClientSecret: z.boolean(),
  createdAt: z.string(),
});
export type OAuthProvider = z.infer<typeof oauthProviderSchema>;

/** Minimal view exposed (unauthenticated) to render login buttons — no config leakage. */
export const publicOAuthProviderSchema = z.object({
  id: z.uuid(),
  type: oauthProviderTypeSchema,
  displayName: z.string(),
});
export type PublicOAuthProvider = z.infer<typeof publicOAuthProviderSchema>;

/** An external identity linked to a local user account. */
export const identitySchema = z.object({
  id: z.uuid(),
  providerId: z.uuid(),
  subject: z.string(),
  email: z.string().nullable(),
  createdAt: z.string(),
  lastLoginAt: z.string().nullable(),
});
export type Identity = z.infer<typeof identitySchema>;
