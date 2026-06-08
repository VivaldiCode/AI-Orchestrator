import type { ProviderType } from '@ai-orchestrator/shared';

/** OAuth tokens for a `subscription`-mode provider (e.g. xAI device flow). */
export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  /** Absolute expiry, epoch milliseconds. */
  expiresAt?: number;
  scope?: string;
  tokenType?: string;
  /** Best-effort account label (e.g. email) from userinfo, for display. */
  account?: string;
}

export interface ProviderCredentials {
  apiKey?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  /** Present only for `subscription` providers. Never returned by the API. */
  oauth?: OAuthTokens;
}

export type ProviderAuthMode = 'api-key' | 'subscription';

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
  /** How the provider authenticates. */
  authMode: ProviderAuthMode;
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
