import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { badRequest } from '../../lib/errors';
import { nowIso, requestId } from '../../lib/ids';
import { AnthropicAdapter } from '../../providers/anthropic';
import { BedrockAdapter } from '../../providers/bedrock';
import { proxyOpenAI } from '../../providers/openaiProxy';
import { clientKeyId, parseBodyJson, parseModel, rewriteBodyModel } from '../shared';

/**
 * OpenAI-compatible `/v1/*` surface. By default requests route to the local
 * Ollama cluster (nodes speak `/v1` natively). The model registry can instead
 * route a model alias to a cloud provider.
 */
export function registerOpenAIRoutes(app: FastifyInstance): void {
  const pre = { preHandler: app.requireApiKey };

  app.get('/v1/models', pre, async (_req, reply) => {
    const created = Math.floor(Date.now() / 1000);
    const ids = new Set<string>();
    for (const node of app.orchestrator.registry.list()) {
      for (const m of node.runtime.models) ids.add(m);
    }
    const data = [...ids].map((id) => ({ id, object: 'model', created, owned_by: 'ollama' }));
    return reply.send({ object: 'list', data });
  });

  app.post('/v1/chat/completions', pre, (req, reply) =>
    handle(app, req, reply, '/v1/chat/completions'),
  );
  app.post('/v1/completions', pre, (req, reply) => handle(app, req, reply, '/v1/completions'));
  app.post('/v1/embeddings', pre, (req, reply) => handle(app, req, reply, '/v1/embeddings'));
}

async function handle(
  app: FastifyInstance,
  req: FastifyRequest,
  reply: FastifyReply,
  endpoint: string,
): Promise<void> {
  const requested = parseModel(req) ?? '';
  const route = app.providers.resolve(requested);
  const keyId = clientKeyId(req);

  // Default + ollama-routed → local cluster (nodes serve /v1 natively).
  if (!route || route.providerType === 'ollama') {
    if (route && route.targetModel && route.targetModel !== requested) {
      rewriteBodyModel(req, route.targetModel);
    }
    await app.orchestrator.dispatcher.proxyOllama(req, reply, {
      endpoint,
      model: route?.targetModel ?? requested,
      clientKeyId: keyId,
    });
    return;
  }

  // OpenAI-compatible cloud providers (openai/xai/mistral/compatible) → streaming proxy.
  if (app.providers.isOpenAIFamily(route.providerType)) {
    const cfg = route.provider;
    const baseUrl = cfg ? app.providers.baseUrlFor(cfg) : null;
    if (!cfg || !baseUrl) {
      throw badRequest(`Provider for "${requested}" is not fully configured.`);
    }
    await proxyOpenAI(
      req,
      reply,
      {
        baseUrl,
        apiKey: cfg.credentials.apiKey ?? null,
        providerName: route.providerType,
        targetModel: route.targetModel,
        originalModel: requested,
        endpoint,
        clientKeyId: keyId,
      },
      app.orchestrator.hub,
      app.orchestrator.recorder,
    );
    return;
  }

  // Adapter-based cloud providers (anthropic/bedrock): chat completions only, non-streaming.
  if (endpoint !== '/v1/chat/completions') {
    throw badRequest(
      `${route.providerType} is only supported on /v1/chat/completions in this build.`,
    );
  }
  const body = parseBodyJson(req) ?? {};
  const started = performance.now();

  let result;
  if (route.providerType === 'anthropic') {
    const apiKey = route.provider?.credentials.apiKey;
    if (!apiKey) throw badRequest('Anthropic API key is not configured.');
    result = await new AnthropicAdapter(apiKey).chat(body, route.targetModel);
  } else if (route.providerType === 'bedrock') {
    const cfg = route.provider;
    if (!cfg?.region) throw badRequest('Bedrock region is not configured.');
    result = await new BedrockAdapter(
      cfg.region,
      cfg.credentials.accessKeyId,
      cfg.credentials.secretAccessKey,
    ).chat(body, route.targetModel);
  } else {
    throw badRequest(`Unsupported provider type: ${route.providerType}.`);
  }

  const latencyMs = Math.round(performance.now() - started);
  const id = requestId();
  app.orchestrator.hub.broadcast({
    type: 'request:end',
    id,
    nodeId: null,
    provider: route.providerType,
    model: requested,
    endpoint,
    status: result.status,
    latencyMs,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    at: nowIso(),
  });
  await app.orchestrator.recorder.record({
    requestId: id,
    nodeId: null,
    provider: route.providerType,
    model: requested,
    endpoint,
    status: result.status,
    latencyMs,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    error: null,
    clientKeyId: keyId,
  });
  await reply.send(result.body);
}
