import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { badRequest, forbidden } from '../../lib/errors';
import { nowIso, requestId } from '../../lib/ids';
import { AnthropicAdapter } from '../../providers/anthropic';
import { BedrockAdapter } from '../../providers/bedrock';
import { proxyOpenAI } from '../../providers/openaiProxy';
import type { ResolvedRoute } from '../../providers/types';
import { triageChat } from '../../orchestrator/triage';
import {
  clientIpOf,
  clientKeyId,
  consumeLocalOnly,
  parseBodyJson,
  parseModel,
  requestTokens,
  rewriteBodyModel,
} from '../shared';

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

/**
 * Core OpenAI `/v1` request handler. Exported so the admin playground can replay
 * a request through the exact production path (routing/providers/overflow).
 */
export async function handle(
  app: FastifyInstance,
  req: FastifyRequest,
  reply: FastifyReply,
  endpoint: string,
  routeOverride?: ResolvedRoute,
): Promise<void> {
  const requested = parseModel(req) ?? '';
  const localOnly = consumeLocalOnly(req);
  const privacy = localOnly || app.orchestrator.getSettings().privacyMode;
  // An explicit override (e.g. the playground targeting a chosen provider) skips
  // the alias registry.
  const route = routeOverride ?? app.providers.resolve(requested);
  const keyId = clientKeyId(req);
  const ip = clientIpOf(req);

  // Default + ollama-routed → local cluster (nodes serve /v1 natively).
  if (!route || route.providerType === 'ollama') {
    if (route && route.targetModel && route.targetModel !== requested) {
      rewriteBodyModel(req, route.targetModel);
    }
    await triageChat(app, req); // opt-in: enrich chat with a Skill + MCP tools
    await app.orchestrator.dispatcher.proxyOllama(req, reply, {
      endpoint,
      model: parseModel(req) ?? route?.targetModel ?? requested,
      clientKeyId: keyId,
      clientIp: ip,
      estimatedTokens: requestTokens(req),
      localOnly,
    });
    return;
  }

  // Privacy: a model that maps to a cloud provider must not leave the cluster.
  if (privacy) {
    throw forbidden(
      `Privacy: "${requested}" routes to a cloud provider, blocked by local-only/privacy mode. Use a local model or disable privacy.`,
    );
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
        clientIp: ip,
      },
      app.orchestrator.hub,
      app.orchestrator.recorder,
      app.archive,
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
    clientIp: ip,
    at: nowIso(),
  });
  await app.orchestrator.recorder.record({
    requestId: id,
    nodeId: null,
    provider: route.providerType,
    model: requested,
    targetModel: route.targetModel !== requested ? route.targetModel : null,
    endpoint,
    status: result.status,
    latencyMs,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    error: null,
    clientKeyId: keyId,
    clientIp: ip,
  });
  await reply.send(result.body);
}
