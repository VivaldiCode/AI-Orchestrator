import { and, eq } from 'drizzle-orm';
import type {
  CreateOAuthProviderInput,
  OAuthProvider,
  OAuthProviderType,
  PublicOAuthProvider,
  Role,
  TokenPair,
  UpdateOAuthProviderInput,
} from '@ai-orchestrator/shared';
import type { DB } from '../db/client';
import {
  identities,
  oauthProviders,
  users,
  type OAuthProviderRow,
  type UserRow,
} from '../db/schema';
import { decryptSecret, encryptSecret } from '../lib/crypto';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { randomToken, type IdTokenClaims } from '../lib/oidc';

interface HandoffEntry {
  tokens: TokenPair;
  expires: number;
}

/**
 * OAuth/OIDC provider configuration, user provisioning, and the short-lived
 * one-time handoff that delivers minted tokens to the SPA after the redirect
 * (so tokens never travel in a URL the browser would log or cache).
 */
export class OAuthService {
  constructor(private readonly db: DB) {}

  // Single-use, 60s post-login handoff codes (in-memory; single instance).
  private readonly handoffs = new Map<string, HandoffEntry>();

  // --- provider config -----------------------------------------------------

  async listProviders(): Promise<OAuthProvider[]> {
    const rows = await this.db.select().from(oauthProviders).orderBy(oauthProviders.createdAt);
    return rows.map((r) => this.toProvider(r));
  }

  /** Enabled providers, minimal shape for the (unauthenticated) login screen. */
  async listPublicProviders(): Promise<PublicOAuthProvider[]> {
    const rows = await this.db
      .select()
      .from(oauthProviders)
      .where(eq(oauthProviders.enabled, true));
    return rows.map((r) => ({
      id: r.id,
      type: r.type as OAuthProviderType,
      displayName: r.displayName,
    }));
  }

  /** Internal: full row (incl. encrypted secret) for the handshake. */
  async getProviderRow(id: string): Promise<OAuthProviderRow | null> {
    const [row] = await this.db
      .select()
      .from(oauthProviders)
      .where(eq(oauthProviders.id, id))
      .limit(1);
    return row ?? null;
  }

  async createProvider(input: CreateOAuthProviderInput): Promise<OAuthProvider> {
    const [row] = await this.db
      .insert(oauthProviders)
      .values({
        type: input.type,
        displayName: input.displayName,
        issuer: input.issuer.replace(/\/+$/, ''),
        clientId: input.clientId,
        clientSecretEncrypted: encryptSecret(input.clientSecret),
        scopes: input.scopes,
        enabled: input.enabled,
        allowedDomains: input.allowedDomains,
        defaultRole: input.defaultRole,
      })
      .returning();
    return this.toProvider(row);
  }

  async updateProvider(id: string, patch: UpdateOAuthProviderInput): Promise<OAuthProvider> {
    const current = await this.getProviderRow(id);
    if (!current) throw notFound('OAuth provider not found.');
    const values: Partial<typeof oauthProviders.$inferInsert> = {};
    if (patch.type !== undefined) values.type = patch.type;
    if (patch.displayName !== undefined) values.displayName = patch.displayName;
    if (patch.issuer !== undefined) values.issuer = patch.issuer.replace(/\/+$/, '');
    if (patch.clientId !== undefined) values.clientId = patch.clientId;
    if (patch.clientSecret !== undefined)
      values.clientSecretEncrypted = encryptSecret(patch.clientSecret);
    if (patch.scopes !== undefined) values.scopes = patch.scopes;
    if (patch.enabled !== undefined) values.enabled = patch.enabled;
    if (patch.allowedDomains !== undefined) values.allowedDomains = patch.allowedDomains;
    if (patch.defaultRole !== undefined) values.defaultRole = patch.defaultRole;
    if (Object.keys(values).length === 0) return this.toProvider(current);
    const [row] = await this.db
      .update(oauthProviders)
      .set(values)
      .where(eq(oauthProviders.id, id))
      .returning();
    return this.toProvider(row);
  }

  async deleteProvider(id: string): Promise<void> {
    await this.db.delete(oauthProviders).where(eq(oauthProviders.id, id));
  }

  /** Decrypt a provider's client secret for the token exchange. */
  clientSecret(row: OAuthProviderRow): string {
    if (!row.clientSecretEncrypted) throw badRequest('Provider has no client secret configured.');
    return decryptSecret(row.clientSecretEncrypted);
  }

  // --- user provisioning ---------------------------------------------------

  /**
   * Resolve the local user for a verified OIDC identity, creating one on first
   * login. Enforces the provider's email-domain allowlist. Does NOT auto-link to
   * existing local accounts by email (that would risk takeover) — first login
   * always creates a dedicated SSO account.
   */
  async findOrProvisionUser(provider: OAuthProviderRow, claims: IdTokenClaims): Promise<UserRow> {
    const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : null;
    const allowed = provider.allowedDomains ?? [];
    if (allowed.length > 0) {
      const domain = email?.split('@')[1];
      const verified = claims.email_verified !== false;
      if (!email || !verified || !domain || !allowed.includes(domain)) {
        throw forbidden('Your email domain is not allowed for this provider.');
      }
    }

    const [identity] = await this.db
      .select()
      .from(identities)
      .where(and(eq(identities.providerId, provider.id), eq(identities.subject, claims.sub)))
      .limit(1);

    if (identity) {
      await this.db
        .update(identities)
        .set({ lastLoginAt: new Date(), email })
        .where(eq(identities.id, identity.id));
      const [user] = await this.db
        .select()
        .from(users)
        .where(eq(users.id, identity.userId))
        .limit(1);
      if (user) return user;
      // Orphaned identity (user was deleted) — drop it and re-provision.
      await this.db.delete(identities).where(eq(identities.id, identity.id));
    }

    const base =
      email ??
      (typeof claims.preferred_username === 'string'
        ? claims.preferred_username
        : `sso_${claims.sub}`);
    const username = await this.uniqueUsername(base);
    const [user] = await this.db
      .insert(users)
      .values({
        username,
        passwordHash: null,
        role: provider.defaultRole as Role,
        permissions: null,
      })
      .returning();
    await this.db.insert(identities).values({
      userId: user.id,
      providerId: provider.id,
      subject: claims.sub,
      email,
      lastLoginAt: new Date(),
    });
    return user;
  }

  private async uniqueUsername(base: string): Promise<string> {
    const clean = base.trim() || `sso_${randomToken(6)}`;
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = attempt === 0 ? clean : `${clean}-${randomToken(2)}`;
      const [exists] = await this.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, candidate))
        .limit(1);
      if (!exists) return candidate;
    }
    return `${clean}-${randomToken(6)}`;
  }

  // --- one-time token handoff ----------------------------------------------

  createHandoff(tokens: TokenPair): string {
    const code = randomToken(24);
    this.handoffs.set(code, { tokens, expires: Date.now() + 60_000 });
    return code;
  }

  consumeHandoff(code: string): TokenPair | null {
    const entry = this.handoffs.get(code);
    if (!entry) return null;
    this.handoffs.delete(code); // single-use
    if (entry.expires < Date.now()) return null;
    return entry.tokens;
  }

  private toProvider(row: OAuthProviderRow): OAuthProvider {
    return {
      id: row.id,
      type: row.type as OAuthProviderType,
      displayName: row.displayName,
      issuer: row.issuer,
      clientId: row.clientId,
      scopes: row.scopes ?? [],
      enabled: row.enabled,
      allowedDomains: row.allowedDomains ?? [],
      defaultRole: row.defaultRole as Role,
      hasClientSecret: !!row.clientSecretEncrypted,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
