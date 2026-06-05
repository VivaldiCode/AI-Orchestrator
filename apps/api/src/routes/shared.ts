import type { FastifyRequest } from 'fastify';
import { estimateRequestTokens } from '../orchestrator/tokens';

/** Parse the raw (buffered) request body as JSON, or null. */
export function parseBodyJson(req: FastifyRequest): Record<string, unknown> | null {
  const buf = req.body as Buffer | undefined;
  if (!buf || buf.length === 0) return null;
  try {
    return JSON.parse(buf.toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Estimated prompt tokens for context-window-aware routing. */
export function requestTokens(req: FastifyRequest): number {
  return estimateRequestTokens(parseBodyJson(req));
}

/** Extract the requested model name from an Ollama/OpenAI body (`model` or `name`). */
export function parseModel(req: FastifyRequest): string | null {
  const o = parseBodyJson(req);
  if (!o) return null;
  if (typeof o.model === 'string') return o.model;
  if (typeof o.name === 'string') return o.name;
  return null;
}

/** Replace the `model` field in the buffered body (for model-registry aliasing). */
export function rewriteBodyModel(req: FastifyRequest, target: string): void {
  const o = parseBodyJson(req);
  if (!o) return;
  o.model = target;
  (req as unknown as { body: Buffer }).body = Buffer.from(JSON.stringify(o));
}

export function clientKeyId(req: FastifyRequest): string | null {
  return req.clientKeyId ?? null;
}

/** Originating client IP (proxy-aware via Fastify's trustProxy). */
export function clientIpOf(req: FastifyRequest): string | null {
  return req.ip ?? null;
}

/**
 * Detect a per-request "keep this local" (privacy) opt-in and strip it from the
 * body so it is never forwarded upstream. Accepts a header
 * (`x-ai-orchestrator-local-only` / `x-local-only`) or a body flag
 * (`local_only` or `privacy` = true).
 */
export function consumeLocalOnly(req: FastifyRequest): boolean {
  const h = req.headers['x-ai-orchestrator-local-only'] ?? req.headers['x-local-only'];
  const viaHeader = typeof h === 'string' && (h === '1' || h.toLowerCase() === 'true');

  let viaBody = false;
  const o = parseBodyJson(req);
  if (o && (o.local_only === true || o.privacy === true)) {
    viaBody = true;
    delete o.local_only;
    delete o.privacy;
    (req as unknown as { body: Buffer }).body = Buffer.from(JSON.stringify(o));
  }
  return viaHeader || viaBody;
}

/** Read a string query parameter. */
export function queryParam(req: FastifyRequest, key: string): string | null {
  const q = req.query as Record<string, unknown> | undefined;
  const v = q?.[key];
  return typeof v === 'string' ? v : null;
}
