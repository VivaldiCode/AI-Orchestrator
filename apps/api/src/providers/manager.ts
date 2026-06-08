import type { ProviderType } from '@ai-orchestrator/shared';
import type { DB } from '../db/client';
import { modelRoutes as routesTable, providers as providersTable } from '../db/schema';
import { decryptSecret } from '../lib/crypto';
import { logger } from '../lib/logger';
import type {
  ProviderAuthMode,
  ProviderConfig,
  ProviderCredentials,
  ResolvedRoute,
} from './types';

const OPENAI_FAMILY: ProviderType[] = ['openai', 'xai', 'openai-compatible', 'mistral', 'google'];

const DEFAULT_BASE_URLS: Partial<Record<ProviderType, string>> = {
  openai: 'https://api.openai.com',
  xai: 'https://api.x.ai',
  mistral: 'https://api.mistral.ai',
};

interface RouteEntry {
  alias: string;
  providerId: string | null;
  providerType: ProviderType;
  targetModel: string;
  enabled: boolean;
}

/** Loads provider configs + the model registry, decrypts credentials, resolves models. */
export class ProviderManager {
  private configs: ProviderConfig[] = [];
  private routes: RouteEntry[] = [];
  /** Month-to-date spend (USD) per provider type, refreshed from analytics. */
  private spendByType = new Map<string, number>();

  constructor(private readonly db: DB) {}

  async load(): Promise<void> {
    const [providerRows, routeRows] = await Promise.all([
      this.db.select().from(providersTable),
      this.db.select().from(routesTable),
    ]);
    this.configs = providerRows.map((r) => {
      const credentials = this.decrypt(r.credentialsEncrypted);
      const authMode = (r.authMode as ProviderAuthMode) ?? 'api-key';
      // Subscription providers authenticate with the OAuth access token; surface
      // it as the bearer so the dispatch hot path (which reads credentials.apiKey)
      // is unchanged.
      if (authMode === 'subscription' && credentials.oauth?.accessToken) {
        credentials.apiKey = credentials.oauth.accessToken;
      }
      return {
        id: r.id,
        type: r.type as ProviderType,
        name: r.name,
        enabled: r.enabled,
        baseUrl: r.baseUrl,
        region: r.region,
        defaultModel: r.defaultModel,
        budgetMonthlyUsd: r.budgetMonthlyUsd ?? 0,
        authMode,
        credentials,
      };
    });
    this.routes = routeRows.map((r) => ({
      alias: r.alias,
      providerId: r.providerId,
      providerType: r.providerType as ProviderType,
      targetModel: r.targetModel,
      enabled: r.enabled,
    }));
  }

  private decrypt(enc: string | null): ProviderCredentials {
    if (!enc) return {};
    try {
      return JSON.parse(decryptSecret(enc)) as ProviderCredentials;
    } catch (err) {
      logger.warn({ err }, 'failed to decrypt provider credentials');
      return {};
    }
  }

  list(): ProviderConfig[] {
    return this.configs;
  }

  getConfig(id: string): ProviderConfig | undefined {
    return this.configs.find((c) => c.id === id);
  }

  /** All subscription-mode providers (e.g. xAI) — used by the refresh loop. */
  subscriptionProviders(): ProviderConfig[] {
    return this.configs.filter((c) => c.authMode === 'subscription');
  }

  /** Public OAuth connection status for a provider (never exposes tokens). */
  subscriptionStatus(id: string): {
    connected: boolean;
    expiresAt: string | null;
    scope: string | null;
    account: string | null;
  } | null {
    const c = this.getConfig(id);
    if (!c || c.authMode !== 'subscription') return null;
    const o = c.credentials.oauth;
    return {
      connected: !!o?.accessToken,
      expiresAt: o?.expiresAt ? new Date(o.expiresAt).toISOString() : null,
      scope: o?.scope ?? null,
      account: o?.account ?? null,
    };
  }

  isOpenAIFamily(type: ProviderType): boolean {
    return OPENAI_FAMILY.includes(type);
  }

  baseUrlFor(cfg: ProviderConfig): string | null {
    return cfg.baseUrl ?? DEFAULT_BASE_URLS[cfg.type] ?? null;
  }

  /** Replace month-to-date spend per provider type (from the analytics refresh). */
  setSpend(spendByType: Map<string, number>): void {
    this.spendByType = spendByType;
  }

  /** Month-to-date spend (USD) for a provider. */
  spentFor(cfg: ProviderConfig): number {
    return this.spentForType(cfg.type);
  }

  /** Month-to-date spend (USD) for a provider type. */
  spentForType(type: string): number {
    return this.spendByType.get(type) ?? 0;
  }

  /** True when the provider has a budget and has met or exceeded it this month. */
  overBudget(cfg: ProviderConfig): boolean {
    return cfg.budgetMonthlyUsd > 0 && this.spentFor(cfg) >= cfg.budgetMonthlyUsd;
  }

  /** Resolve a public model alias to a provider + target model (null → local Ollama). */
  resolve(modelAlias: string): ResolvedRoute | null {
    const route = this.routes.find((r) => r.enabled && r.alias === modelAlias);
    if (!route) return null;
    if (route.providerType === 'ollama') {
      return { providerType: 'ollama', targetModel: route.targetModel, provider: null };
    }
    const provider = route.providerId ? (this.getConfig(route.providerId) ?? null) : null;
    return { providerType: route.providerType, targetModel: route.targetModel, provider };
  }
}
