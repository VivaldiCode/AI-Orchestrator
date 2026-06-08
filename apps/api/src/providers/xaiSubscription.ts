import { eq } from 'drizzle-orm';
import type { DeviceLogin, DevicePoll } from '@ai-orchestrator/shared';
import type { DB } from '../db/client';
import { providers as providersTable } from '../db/schema';
import { decryptSecret, encryptSecret } from '../lib/crypto';
import { logger } from '../lib/logger';
import {
  discoverXai,
  fetchUserinfo,
  pollDeviceToken,
  refreshAccessToken,
  startDeviceFlow,
} from '../lib/xaiOAuth';
import type { OAuthTokens, ProviderConfig, ProviderCredentials } from './types';

/** Refresh a subscription token when it is within this window of expiring. */
const REFRESH_SKEW_MS = 5 * 60 * 1000;

interface PendingDevice {
  deviceCode: string;
  interval: number;
  expiresAt: number;
}

/**
 * Drives the xAI subscription (OAuth device flow) lifecycle: starting a login,
 * polling for approval, persisting + refreshing tokens, and disconnecting. The
 * tokens live inside the provider's encrypted credentials blob; after any write
 * the caller reloads the ProviderManager so the in-memory bearer updates.
 */
export class XaiSubscriptionService {
  private pending = new Map<string, PendingDevice>();

  constructor(private readonly db: DB) {}

  /** Begin device login for a provider; returns the code + URL to show the user. */
  async start(providerId: string): Promise<DeviceLogin> {
    const disc = await discoverXai();
    const res = await startDeviceFlow(disc);
    this.pending.set(providerId, {
      deviceCode: res.deviceCode,
      interval: res.interval,
      expiresAt: Date.now() + res.expiresIn * 1000,
    });
    return {
      userCode: res.userCode,
      verificationUri: res.verificationUri,
      verificationUriComplete: res.verificationUriComplete,
      expiresInSeconds: res.expiresIn,
      intervalSeconds: res.interval,
    };
  }

  /** Poll once for approval. On success, persists tokens to the provider. */
  async poll(providerId: string): Promise<DevicePoll> {
    const p = this.pending.get(providerId);
    if (!p) return { status: 'error', message: 'No pending login. Start the connection again.' };
    if (Date.now() > p.expiresAt) {
      this.pending.delete(providerId);
      return { status: 'expired' };
    }
    const disc = await discoverXai();
    const result = await pollDeviceToken(disc, p.deviceCode);
    if (result.status === 'ok') {
      this.pending.delete(providerId);
      const account = await fetchUserinfo(disc, result.tokens.accessToken);
      const tokens: OAuthTokens = { ...result.tokens, account: account ?? undefined };
      await this.persist(providerId, tokens);
      logger.info({ providerId, account }, 'xAI subscription connected');
      return {
        status: 'connected',
        expiresAt: tokens.expiresAt ? new Date(tokens.expiresAt).toISOString() : null,
        account: account ?? null,
      };
    }
    if (result.status === 'pending' || result.status === 'slow_down') return { status: 'pending' };
    if (result.status === 'denied') {
      this.pending.delete(providerId);
      return { status: 'denied' };
    }
    if (result.status === 'expired') {
      this.pending.delete(providerId);
      return { status: 'expired' };
    }
    return { status: 'error', message: result.message };
  }

  /** Remove the stored OAuth tokens for a provider (keeps other credentials). */
  async disconnect(providerId: string): Promise<void> {
    this.pending.delete(providerId);
    const creds = await this.readCreds(providerId);
    delete creds.oauth;
    await this.writeCreds(providerId, creds);
  }

  /** True when the provider holds a subscription token close to expiry. */
  needsRefresh(cfg: ProviderConfig): boolean {
    const o = cfg.credentials.oauth;
    return (
      cfg.authMode === 'subscription' &&
      !!o?.refreshToken &&
      (o.expiresAt == null || o.expiresAt - Date.now() < REFRESH_SKEW_MS)
    );
  }

  /** Refresh one provider's access token using its refresh token (persists). */
  async refresh(cfg: ProviderConfig): Promise<boolean> {
    const refreshToken = cfg.credentials.oauth?.refreshToken;
    if (!refreshToken) return false;
    try {
      const disc = await discoverXai();
      const tokens = await refreshAccessToken(disc, refreshToken);
      await this.persist(cfg.id, { ...tokens, account: cfg.credentials.oauth?.account });
      logger.info({ providerId: cfg.id }, 'xAI subscription token refreshed');
      return true;
    } catch (err) {
      logger.warn({ providerId: cfg.id, err: (err as Error).message }, 'xAI token refresh failed');
      return false;
    }
  }

  private async persist(providerId: string, tokens: OAuthTokens): Promise<void> {
    const creds = await this.readCreds(providerId);
    creds.oauth = tokens;
    await this.writeCreds(providerId, creds, 'subscription');
  }

  private async readCreds(providerId: string): Promise<ProviderCredentials> {
    const [row] = await this.db
      .select({ enc: providersTable.credentialsEncrypted })
      .from(providersTable)
      .where(eq(providersTable.id, providerId));
    if (!row?.enc) return {};
    try {
      return JSON.parse(decryptSecret(row.enc)) as ProviderCredentials;
    } catch {
      return {};
    }
  }

  private async writeCreds(
    providerId: string,
    creds: ProviderCredentials,
    authMode?: 'subscription',
  ): Promise<void> {
    const hasAny = Object.keys(creds).length > 0;
    const update: Record<string, unknown> = {
      credentialsEncrypted: hasAny ? encryptSecret(JSON.stringify(creds)) : null,
      updatedAt: new Date(),
    };
    if (authMode) update.authMode = authMode;
    await this.db.update(providersTable).set(update).where(eq(providersTable.id, providerId));
  }
}
