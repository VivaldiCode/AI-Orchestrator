import type { FastifyInstance } from 'fastify';
import { analyticsQuerySchema } from '@ai-orchestrator/shared';
import { getAnalytics, getRecentEvents } from '../../analytics/queries';
import {
  isEmbedEndpoint,
  overflowSupports,
  pickEmbedProvider,
  resolveCloudOverflow,
  resolveEquivalenceChain,
} from '../../providers/overflow';
import { parseWith } from './util';

export function registerAnalyticsRoutes(app: FastifyInstance): void {
  const read = { preHandler: app.requirePermission('analytics:read') };

  // Diagnose why a model would (not) overflow to a provider. Answers the common
  // "nothing goes to the providers" question with the exact decision + reasons.
  app.get('/overflow/diagnose', read, async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const model = typeof q.model === 'string' ? q.model : '';
    const endpoint = typeof q.endpoint === 'string' && q.endpoint ? q.endpoint : '/api/chat';
    const settings = app.orchestrator.getSettings();
    const pm = app.providers;
    const nodes = app.orchestrator.dispatcher.candidates(model);
    const candidates = nodes.map((n) => ({
      name: n.name,
      inFlight: n.runtime.inFlight,
      maxConcurrency: n.maxConcurrency,
      hasSlot: n.runtime.inFlight < n.maxConcurrency,
    }));
    const localUnavailable =
      nodes.length === 0 || !nodes.some((n) => n.runtime.inFlight < n.maxConcurrency);
    const chain = resolveEquivalenceChain(pm, model).map((c) => `${c.provider.type}/${c.model}`);
    const cloud = settings.cloudOverflow ? resolveCloudOverflow(pm, settings) : null;
    const embedProvider = settings.embedOverflow ? pickEmbedProvider(pm, settings) : null;
    const reasons: string[] = [];
    let verdict: 'local' | 'overflow' | 'queue' | 'local-only';
    let target: string | null = null;

    if (settings.privacyMode) {
      verdict = 'local-only';
      reasons.push('Privacy mode is ON — inference never overflows to the cloud.');
    } else if (!localUnavailable) {
      verdict = 'local';
      reasons.push('A local node has a free slot — served locally (overflow only fires when full).');
    } else if (isEmbedEndpoint(endpoint)) {
      if (embedProvider) {
        target = `${embedProvider.type}/${settings.embedOverflowModel}`;
        verdict = 'overflow';
        reasons.push(`Would overflow embeddings to ${target}.`);
      } else {
        verdict = 'queue';
        reasons.push(
          'Embeddings never use chat overflow. Turn on "Embedding overflow" + a provider and model.',
        );
      }
    } else if (!overflowSupports(endpoint)) {
      verdict = 'queue';
      reasons.push(`${endpoint} is not overflow-eligible; it queues for a local slot.`);
    } else if (chain.length > 0) {
      target = chain[0];
      verdict = 'overflow';
      reasons.push(`Would overflow via the equivalence chain to ${target}.`);
    } else if (cloud) {
      target = `${cloud.provider.type}/${cloud.model}`;
      verdict = 'overflow';
      reasons.push(`Would overflow (cloud overflow) to ${target}.`);
    } else {
      verdict = 'queue';
      reasons.push(`No equivalence group has "${model}" as a member.`);
      if (!settings.cloudOverflow) {
        reasons.push('Cloud overflow is OFF — enable it in Settings.');
      } else {
        reasons.push(
          'Cloud overflow is on but no usable provider + model — pick a provider and set an overflow model in Settings.',
        );
      }
      reasons.push('⇒ the request QUEUES for a local node slot (this is your "11 waiting").');
    }

    return reply.send({
      model,
      endpoint,
      privacyMode: settings.privacyMode,
      cloudOverflow: settings.cloudOverflow,
      embedOverflow: settings.embedOverflow,
      candidates,
      localUnavailable,
      equivalenceChain: chain,
      cloudFallback: cloud ? `${cloud.provider.type}/${cloud.model}` : null,
      verdict,
      target,
      reasons,
    });
  });

  app.get('/analytics', read, async (req, reply) => {
    const query = parseWith(analyticsQuerySchema, req.query);
    return reply.send(await getAnalytics(query));
  });

  // Recent request rows for the Debug view (newest first; `errors=1` = failures only).
  // Optional filters: provider, ip, endpoint, model, nodeId, status.
  app.get('/debug/events', read, async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(Number(q.limit) || 100, 1), 500);
    const str = (v: string | undefined): string | undefined =>
      typeof v === 'string' && v ? v : undefined;
    const status = Number(q.status);
    return reply.send(
      await getRecentEvents({
        limit,
        onlyErrors: q.errors === '1' || q.errors === 'true',
        provider: str(q.provider),
        ip: str(q.ip),
        endpoint: str(q.endpoint),
        model: str(q.model),
        nodeId: str(q.nodeId),
        status: Number.isFinite(status) && status > 0 ? status : undefined,
      }),
    );
  });
}
