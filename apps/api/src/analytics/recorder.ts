import type { DB } from '../db/client';
import { requestEvents } from '../db/schema';
import { logger } from '../lib/logger';
import type { PriceBook } from '../cost/pricebook';

export interface RequestEventInput {
  requestId: string;
  nodeId: string | null;
  provider: string;
  model: string;
  /** Substitute model actually sent upstream, when it differs from `model`. */
  targetModel?: string | null;
  endpoint: string;
  status: number;
  latencyMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  error: string | null;
  clientKeyId: string | null;
  /** Originating client IP, for the Debug view + per-IP filtering. */
  clientIp?: string | null;
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
    // Price by the model the provider actually served (the substitute target when
    // an equivalence chain redirected the request), falling back to the asked model.
    const costUsd =
      this.prices?.costOf(
        e.provider,
        e.targetModel ?? e.model,
        e.promptTokens,
        e.completionTokens,
      ) ?? null;
    try {
      await this.db.insert(requestEvents).values({
        requestId: e.requestId,
        nodeId: e.nodeId,
        provider: e.provider,
        model: e.model,
        targetModel: e.targetModel ?? null,
        endpoint: e.endpoint,
        status: e.status,
        latencyMs: e.latencyMs,
        promptTokens: e.promptTokens,
        completionTokens: e.completionTokens,
        totalTokens,
        costUsd,
        error: e.error,
        clientKeyId: e.clientKeyId,
        clientIp: e.clientIp ?? null,
      });
    } catch (err) {
      logger.warn({ err }, 'failed to record request event');
    }
  }
}
