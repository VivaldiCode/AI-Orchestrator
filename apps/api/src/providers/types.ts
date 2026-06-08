import type { ProviderType } from '@ai-orchestrator/shared';

export interface ProviderCredentials {
  apiKey?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

/** Decrypted, in-memory provider configuration. */
export interface ProviderConfig {
  id: string;
  type: ProviderType;
  name: string;
  enabled: boolean;
  baseUrl: string | null;
  region: string | null;
  defaultModel: string | null;
  /** Monthly spend cap (USD). 0 = no budget. */
  budgetMonthlyUsd: number;
  credentials: ProviderCredentials;
}

/** Result of resolving a public model alias through the model registry. */
export interface ResolvedRoute {
  providerType: ProviderType;
  targetModel: string;
  /** null for the implicit local Ollama cluster. */
  provider: ProviderConfig | null;
}

/** Normalised result returned by cloud (non-streaming) adapters. */
export interface AdapterResult {
  status: number;
  body: unknown;
  promptTokens: number | null;
  completionTokens: number | null;
}
