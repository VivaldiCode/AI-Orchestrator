import { Readable } from 'node:stream';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config/index';
import { badGateway } from '../lib/errors';
import { nowIso, requestId } from '../lib/ids';
import { buildResponseHeaders, readTailWeb } from '../orchestrator/proxy';
import type { AnalyticsRecorder } from '../analytics/recorder';
import type { RealtimeHub } from '../realtime/hub';
import { extractOpenAIUsage } from './util';

export interface OpenAIProxyTarget {
  baseUrl: string;
  apiKey: string | null;
  providerName: string;
  targetModel: string;
  originalModel: string;
  endpoint: string;
  clientKeyId: string | null;
  clientIp?: string | null;
}

/**
 * Stream-proxies a `/v1/*` request to an OpenAI-compatible provider
 * (OpenAI, xAI, Mistral, any compatible endpoint), rewriting the model and
 * injecting the provider credential. Supports streaming and non-streaming.
 */
export async function proxyOpenAI(
  request: FastifyRequest,
  reply: FastifyReply,
  target: OpenAIProxyTarget,
  hub: RealtimeHub,
  recorder: AnalyticsRecorder,
): Promise<void> {
  const url = `${target.baseUrl}${request.url}`;
  const bodyBuf = request.body as Buffer | undefined;
  let bodyStr: string | undefined;
  try {
    const obj =
      bodyBuf && bodyBuf.length
        ? (JSON.parse(bodyBuf.toString('utf8')) as Record<string, unknown>)
        : null;
    if (obj) {
      obj.model = target.targetModel;
      bodyStr = JSON.stringify(obj);
    }
  } catch {
    bodyStr = bodyBuf?.toString('utf8');
  }

  const headers: Record<string, string> = { 'content-type': 'application/json', accept: '*/*' };
  if (target.apiKey) headers['authorization'] = `Bearer ${target.apiKey}`;

  const id = requestId();
  const started = performance.now();
  hub.broadcast({
    type: 'request:start',
    id,
    nodeId: null,
    provider: target.providerName,
    model: target.originalModel,
    endpoint: target.endpoint,
    clientIp: target.clientIp ?? null,
    at: nowIso(),
  });

  const record = async (
    status: number,
    promptTokens: number | null,
    completionTokens: number | null,
    error: string | null,
  ): Promise<void> => {
    const latencyMs = Math.round(performance.now() - started);
    hub.broadcast({
      type: 'request:end',
      id,
      nodeId: null,
      provider: target.providerName,
      model: target.originalModel,
      endpoint: target.endpoint,
      status,
      latencyMs,
      promptTokens,
      completionTokens,
      clientIp: target.clientIp ?? null,
      at: nowIso(),
    });
    await recorder.record({
      requestId: id,
      nodeId: null,
      provider: target.providerName,
      model: target.originalModel,
      endpoint: target.endpoint,
      status,
      latencyMs,
      promptTokens,
      completionTokens,
      error,
      clientKeyId: target.clientKeyId,
    });
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.requestTimeoutMs);

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: request.method,
      headers,
      body: bodyStr,
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    await record(502, null, null, (err as Error).message);
    throw badGateway(`Provider request failed: ${(err as Error).message}`);
  }

  reply.hijack();
  const res = reply.raw;
  res.writeHead(upstream.status, buildResponseHeaders(upstream.headers));

  if (!upstream.body) {
    res.end();
    clearTimeout(timer);
    await record(
      upstream.status,
      null,
      null,
      upstream.status >= 400 ? `upstream ${upstream.status}` : null,
    );
    return;
  }

  const [toClient, toParse] = upstream.body.tee();
  const readable = Readable.fromWeb(toClient as unknown as Parameters<typeof Readable.fromWeb>[0]);
  readable.on('error', () => res.end());
  res.on('close', () => ctrl.abort());
  readable.pipe(res);

  void (async () => {
    try {
      const tail = await readTailWeb(toParse);
      const usage = extractOpenAIUsage(tail);
      await record(
        upstream.status,
        usage.promptTokens,
        usage.completionTokens,
        upstream.status >= 400 ? `upstream ${upstream.status}` : null,
      );
    } catch {
      await record(upstream.status, null, null, null);
    } finally {
      clearTimeout(timer);
    }
  })();
}
