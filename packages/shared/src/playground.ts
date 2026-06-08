import { z } from 'zod';

/** Which inbound API dialect the playground request is written in. */
export const playgroundFormatSchema = z.enum(['openai', 'anthropic']);
export type PlaygroundFormat = z.infer<typeof playgroundFormatSchema>;

/**
 * A playground call: a raw provider request body (model, messages, params…) in
 * the chosen format. The server replays it through the real production path
 * (`/v1/chat/completions` or `/v1/messages`) — routing, providers, overflow,
 * budgets and privacy all apply — and captures the response.
 */
export const playgroundRequestSchema = z.object({
  format: playgroundFormatSchema,
  body: z.record(z.string(), z.unknown()),
});
export type PlaygroundRequest = z.infer<typeof playgroundRequestSchema>;

/** Where the request was actually served from. */
export interface PlaygroundServedBy {
  nodeId: string | null;
  nodeName: string | null;
  provider: string | null;
}

/** Result of a playground call. */
export interface PlaygroundResult {
  status: number;
  latencyMs: number;
  servedBy: PlaygroundServedBy;
  contentType: string | null;
  /** Parsed JSON response when possible, otherwise the raw text. */
  body: unknown;
  /** The raw response text (useful for streamed/SSE bodies). */
  raw: string;
}
