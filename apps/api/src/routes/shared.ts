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

/** Read a string query parameter. */
export function queryParam(req: FastifyRequest, key: string): string | null {
  const q = req.query as Record<string, unknown> | undefined;
  const v = q?.[key];
  return typeof v === 'string' ? v : null;
}
