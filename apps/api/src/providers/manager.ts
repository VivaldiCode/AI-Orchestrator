import type { ProviderType } from '@ai-orchestrator/shared';
import type { DB } from '../db/client';
import { modelRoutes as routesTable, providers as providersTable } from '../db/schema';
import { decryptSecret } from '../lib/crypto';
import { logger } from '../lib/logger';
import type { ProviderConfig, ProviderCredentials, ResolvedRoute } from './types';

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

  constructor(private readonly db: DB) {}

  async load(): Promise<void> {
    const [providerRows, routeRows] = await Promise.all([
      this.db.select().from(providersTable),
      this.db.select().from(routesTable),
    ]);
    this.configs = providerRows.map((r) => ({
      id: r.id,
      type: r.type as ProviderType,
      name: r.name,
      enabled: r.enabled,
      baseUrl: r.baseUrl,
      region: r.region,
      defaultModel: r.defaultModel,
      credentials: this.decrypt(r.credentialsEncrypted),
    }));
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

  isOpenAIFamily(type: ProviderType): boolean {
    return OPENAI_FAMILY.includes(type);
  }

  baseUrlFor(cfg: ProviderConfig): string | null {
    return cfg.baseUrl ?? DEFAULT_BASE_URLS[cfg.type] ?? null;
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
