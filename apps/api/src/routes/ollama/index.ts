import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { APP_NAME, APP_VERSION } from '../../version';
import { runTriageAgent, triageChat } from '../../orchestrator/triage';
import { clientKeyId, parseModel, queryParam, requestTokens } from '../shared';

/**
 * Faithful mirror of the Ollama REST API. Inference endpoints are
 * load-balanced; `/api/tags` and `/api/ps` are aggregated across nodes;
 * model-management endpoints proxy to a single (optionally chosen) node.
 */
export function registerOllamaRoutes(app: FastifyInstance): void {
  const { dispatcher } = app.orchestrator;
  const pre = { preHandler: app.requireApiKey };

  const inference = (endpoint: string) => async (req: FastifyRequest, reply: FastifyReply) => {
    // Phase 2: autonomous tool-call loop (non-streaming chat with eligible tools).
    if (endpoint === '/api/chat' && (await runTriageAgent(app, req, reply))) return;
    await triageChat(app, req); // phase 1: enrich chat with a Skill + advertise MCP tools
    return dispatcher.proxyOllama(req, reply, {
      endpoint,
      model: parseModel(req),
      clientKeyId: clientKeyId(req),
      estimatedTokens: requestTokens(req),
    });
  };

  const toNode = (endpoint: string) => (req: FastifyRequest, reply: FastifyReply) =>
    dispatcher.proxyToNode(queryParam(req, 'node'), req, reply, {
      endpoint,
      model: parseModel(req),
      clientKeyId: clientKeyId(req),
      estimatedTokens: requestTokens(req),
    });

  // --- inference (load-balanced, streaming) --------------------------------
  app.post('/api/generate', pre, inference('/api/generate'));
  app.post('/api/chat', pre, inference('/api/chat'));
  app.post('/api/embed', pre, inference('/api/embed'));
  app.post('/api/embeddings', pre, inference('/api/embeddings')); // legacy
  app.post('/api/show', pre, inference('/api/show'));

  // --- aggregated reads ----------------------------------------------------
  app.get('/api/tags', pre, async (_req, reply) => {
    return reply.send(await dispatcher.aggregateTags());
  });
  app.get('/api/ps', pre, async (_req, reply) => {
    return reply.send(await dispatcher.aggregatePs());
  });
  app.get('/api/version', async (_req, reply) => {
    // Open (no API key) so clients can probe connectivity, like Ollama.
    return reply.send({ version: APP_VERSION, orchestrator: APP_NAME });
  });

  // --- model management (single node; choose with ?node=<id>) --------------
  app.post('/api/pull', pre, toNode('/api/pull'));
  app.post('/api/push', pre, toNode('/api/push'));
  app.post('/api/create', pre, toNode('/api/create'));
  app.post('/api/copy', pre, toNode('/api/copy'));
  app.delete('/api/delete', pre, toNode('/api/delete'));
  app.head('/api/blobs/:digest', pre, toNode('/api/blobs'));
  app.post('/api/blobs/:digest', pre, toNode('/api/blobs'));
}
