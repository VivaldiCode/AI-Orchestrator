import type { ProviderBalance } from '@ai-orchestrator/shared';
import { logger } from '../lib/logger';
import type { ProviderConfig } from './types';

/**
 * Best-effort **live account balance** for a provider, fetched from its API with
 * the stored credential. Most providers (OpenAI, Anthropic, xAI's inference key)
 * do not expose a balance endpoint, so this returns `available: false` with a
 * note for those. Adapters are matched by base-URL host, so any OpenAI-compatible
 * aggregator that follows a known scheme works.
 */

const TIMEOUT_MS = 6000;

function hostOf(url: string | null): string {
  if (!url) return '';
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return '';
  }
}

function unavailable(note: string): ProviderBalance {
  return { available: false, balanceUsd: null, currency: null, source: null, note };
}

async function getJson(url: string, headers: Record<string, string>): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json', ...headers },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Parse an OpenRouter `/api/v1/credits` body → remaining balance (USD), or null. */
export function openRouterBalanceUsd(json: any): number | null {
  const d = json?.data;
  if (d && typeof d.total_credits === 'number') return d.total_credits - (d.total_usage ?? 0);
  return null;
}

/** Parse a DeepSeek `/user/balance` body → { balanceUsd, currency }, or null. */
export function deepSeekBalanceUsd(json: any): { balanceUsd: number; currency: string } | null {
  const infos: any[] = Array.isArray(json?.balance_infos) ? json.balance_infos : [];
  const info = infos.find((x) => x?.currency === 'USD') ?? infos[0];
  if (info && info.total_balance != null) {
    return { balanceUsd: Number(info.total_balance), currency: info.currency ?? 'USD' };
  }
  return null;
}

export async function fetchProviderBalance(
  provider: ProviderConfig,
  baseUrl: string | null,
): Promise<ProviderBalance> {
  const key = provider.credentials.apiKey;
  if (!key) return unavailable('No API key stored for this provider.');
  const host = hostOf(baseUrl);

  try {
    // OpenRouter — GET /api/v1/credits → { data: { total_credits, total_usage } }
    if (host.endsWith('openrouter.ai')) {
      const j = (await getJson(`https://${host}/api/v1/credits`, {
        authorization: `Bearer ${key}`,
      })) as any;
      const bal = openRouterBalanceUsd(j);
      if (bal != null) {
        return {
          available: true,
          balanceUsd: bal,
          currency: 'USD',
          source: 'openrouter',
          note: null,
        };
      }
      return unavailable('Could not read OpenRouter credits.');
    }

    // DeepSeek — GET /user/balance → { balance_infos: [{ currency, total_balance }] }
    if (host.endsWith('deepseek.com')) {
      const j = (await getJson(`https://${host}/user/balance`, {
        authorization: `Bearer ${key}`,
      })) as any;
      const parsed = deepSeekBalanceUsd(j);
      if (parsed) {
        return {
          available: true,
          balanceUsd: parsed.balanceUsd,
          currency: parsed.currency,
          source: 'deepseek',
          note:
            (j as any)?.is_available === false ? 'Account marked not available by DeepSeek.' : null,
        };
      }
      return unavailable('Could not read DeepSeek balance.');
    }
  } catch (err) {
    logger.warn({ err, provider: provider.name }, 'provider balance fetch failed');
    return unavailable('Balance lookup failed.');
  }

  return unavailable(`${provider.type} does not expose an account balance via API with this key.`);
}
