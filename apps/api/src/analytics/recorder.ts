import type { DB } from '../db/client';
import { requestEvents } from '../db/schema';
import { logger } from '../lib/logger';
import type { PriceBook } from '../cost/pricebook';

export interface RequestEventInput {
  requestId: string;
  nodeId: string | null;
  provider: string;
  model: string;
  endpoint: string;
  status: number;
  latencyMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  error: string | null;
  clientKeyId: string | null;
}

/**
 * Persists one row per proxied request into the `request_events` hypertable.
 * Recording must never break the request path, so failures are swallowed (logged).
 */
export class AnalyticsRecorder {
  constructor(
    private readonly db: DB,
    private readonly prices?: PriceBook,
  ) {}

  async record(e: RequestEventInput): Promise<void> {
    const totalTokens =
      e.promptTokens != null || e.completionTokens != null
        ? (e.promptTokens ?? 0) + (e.completionTokens ?? 0)
        : null;
    const costUsd =
      this.prices?.costOf(e.provider, e.model, e.promptTokens, e.completionTokens) ?? null;
    try {
      await this.db.insert(requestEvents).values({
        requestId: e.requestId,
        nodeId: e.nodeId,
        provider: e.provider,
        model: e.model,
        endpoint: e.endpoint,
        status: e.status,
        latencyMs: e.latencyMs,
        promptTokens: e.promptTokens,
        completionTokens: e.completionTokens,
        totalTokens,
        costUsd,
        error: e.error,
        clientKeyId: e.clientKeyId,
      });
    } catch (err) {
      logger.warn({ err }, 'failed to record request event');
    }
  }
}
