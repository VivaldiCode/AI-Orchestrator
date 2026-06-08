import type { FastifyInstance } from 'fastify';
import { runAnthropicMessages } from '../../anthropic/run';
import { estimateAnthropicTokens } from '../../anthropic/translate';
import { parseBodyJson } from '../shared';

/**
 * Anthropic Messages API surface (`/v1/messages`) — what Claude Code speaks.
 * Routes through the orchestrator: passthrough to an Anthropic provider, or
 * Anthropic⇄OpenAI translation onto the local cluster / cloud overflow.
 * Point Claude Code at this host via ANTHROPIC_BASE_URL + an orchestrator API
 * key (ANTHROPIC_API_KEY → x-api-key, or ANTHROPIC_AUTH_TOKEN → Bearer).
 */
export function registerAnthropicRoutes(app: FastifyInstance): void {
  const pre = { preHandler: app.requireApiKey };

  app.post('/v1/messages', pre, (req, reply) => runAnthropicMessages(app, req, reply));

  // Claude Code calls this to size context before a request; return an estimate.
  app.post('/v1/messages/count_tokens', pre, async (req, reply) => {
    const body = parseBodyJson(req) ?? {};
    return reply.send({ input_tokens: estimateAnthropicTokens(body) });
  });
}
