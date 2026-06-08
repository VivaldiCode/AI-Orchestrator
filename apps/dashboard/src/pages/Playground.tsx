import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { PlaygroundFormat, PlaygroundResult } from '@ai-orchestrator/shared';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { Button, Card, Field, Input, Select, Spinner } from '../components/ui';

const TEXTAREA =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-concert-500';

type Json = Record<string, unknown>;

/** Build the raw provider body for the chosen format. */
function buildBody(opts: {
  format: PlaygroundFormat;
  model: string;
  system: string;
  user: string;
  temperature: string;
  maxTokens: string;
}): Json {
  const temp = opts.temperature !== '' ? Number(opts.temperature) : undefined;
  const maxTok = opts.maxTokens !== '' ? Number(opts.maxTokens) : undefined;

  if (opts.format === 'anthropic') {
    const body: Json = {
      model: opts.model,
      max_tokens: maxTok ?? 1024,
      messages: [{ role: 'user', content: opts.user }],
      stream: false,
    };
    if (opts.system) body.system = opts.system;
    if (temp !== undefined) body.temperature = temp;
    return body;
  }

  const messages: Json[] = [];
  if (opts.system) messages.push({ role: 'system', content: opts.system });
  messages.push({ role: 'user', content: opts.user });
  const body: Json = { model: opts.model, messages, stream: false };
  if (maxTok !== undefined) body.max_tokens = maxTok;
  if (temp !== undefined) body.temperature = temp;
  return body;
}

/** Extract the assistant text from either an OpenAI or Anthropic response body. */
function extractText(body: unknown): string {
  if (typeof body === 'string') return body;
  if (!body || typeof body !== 'object') return '';
  const b = body as Json;
  if (Array.isArray(b.content)) {
    return (b.content as Json[])
      .filter((c) => c?.type === 'text')
      .map((c) => String(c.text ?? ''))
      .join('');
  }
  if (Array.isArray(b.choices)) {
    return (b.choices as Json[])
      .map((c) => String((c.message as Json | undefined)?.content ?? ''))
      .join('');
  }
  return '';
}

function extractUsage(body: unknown): { input: number; output: number } | null {
  if (!body || typeof body !== 'object') return null;
  const u = (body as Json).usage as Json | undefined;
  if (!u) return null;
  return {
    input: Number(u.prompt_tokens ?? u.input_tokens ?? 0),
    output: Number(u.completion_tokens ?? u.output_tokens ?? 0),
  };
}

export function PlaygroundPage() {
  const { t } = useI18n();
  const [format, setFormat] = useState<PlaygroundFormat>('openai');
  const [providerId, setProviderId] = useState('');
  const [model, setModel] = useState('');
  const [system, setSystem] = useState('');
  const [user, setUser] = useState('');
  const [temperature, setTemperature] = useState('');
  const [maxTokens, setMaxTokens] = useState('');
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const optionsQuery = useQuery({ queryKey: ['playground-options'], queryFn: api.playgroundOptions });
  const groups = optionsQuery.data?.groups ?? [];
  const currentModels = groups.find((g) => g.id === providerId)?.models ?? [];

  // Default to the first provider that has models once options load.
  useEffect(() => {
    if (providerId || groups.length === 0) return;
    const first = groups.find((g) => g.models.length > 0) ?? groups[0];
    if (first) {
      setProviderId(first.id);
      setModel(first.models[0] ?? '');
    }
  }, [groups, providerId]);

  const run = useMutation({
    mutationFn: () =>
      api.playground({ format, body: buildBody({ format, model, system, user, temperature, maxTokens }) }),
    onSuccess: (r) => {
      setResult(r);
      setError(null);
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : t('playground.requestError')),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run.mutate();
  };

  const requestPreview = JSON.stringify(
    buildBody({ format, model, system, user, temperature, maxTokens }),
    null,
    2,
  );

  const text = result ? extractText(result.body) : '';
  const usage = result ? extractUsage(result.body) : null;
  const served =
    result?.servedBy.nodeName ?? result?.servedBy.provider ?? (result ? '—' : '');
  const isError = !!result && result.status >= 400;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-50">{t('playground.title')}</h1>
        <p className="text-sm text-slate-400">{t('playground.subtitle')}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t('playground.format')}>
                <Select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as PlaygroundFormat)}
                >
                  <option value="openai">OpenAI (/v1/chat/completions)</option>
                  <option value="anthropic">Anthropic (/v1/messages)</option>
                </Select>
              </Field>
              <Field label={t('playground.provider')}>
                <Select
                  value={providerId}
                  disabled={groups.length === 0}
                  onChange={(e) => {
                    const id = e.target.value;
                    setProviderId(id);
                    setModel(groups.find((g) => g.id === id)?.models[0] ?? '');
                  }}
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id} disabled={g.models.length === 0}>
                      {g.label}
                      {g.models.length === 0 ? ' (—)' : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('playground.model')}>
                <Select
                  value={model}
                  disabled={currentModels.length === 0}
                  onChange={(e) => setModel(e.target.value)}
                >
                  {currentModels.length === 0 ? (
                    <option value="">{t('playground.noModels')}</option>
                  ) : (
                    currentModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))
                  )}
                </Select>
              </Field>
            </div>

            <Field label={t('playground.system')}>
              <textarea
                className={TEXTAREA}
                rows={2}
                value={system}
                onChange={(e) => setSystem(e.target.value)}
                placeholder={t('playground.systemPlaceholder')}
              />
            </Field>

            <Field label={t('playground.userMessage')}>
              <textarea
                className={TEXTAREA}
                rows={5}
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder={t('playground.userPlaceholder')}
                required
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('playground.temperature')}>
                <Input
                  type="number"
                  min={0}
                  max={2}
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  placeholder="default"
                />
              </Field>
              <Field label={t('playground.maxTokens')}>
                <Input
                  type="number"
                  min={1}
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(e.target.value)}
                  placeholder={format === 'anthropic' ? '1024' : 'default'}
                />
              </Field>
            </div>

            <Button type="submit" disabled={run.isPending || !model || !user}>
              {run.isPending ? t('playground.sending') : t('playground.send')}
            </Button>
            {error ? <p className="text-sm text-rose-400">{error}</p> : null}

            <details className="text-xs text-slate-400">
              <summary className="cursor-pointer">{t('playground.requestBody')}</summary>
              <pre className="mt-2 overflow-auto rounded-lg bg-slate-950 p-3 text-slate-300">
                {requestPreview}
              </pre>
            </details>
          </form>
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-medium text-slate-100">{t('playground.response')}</h2>
          {run.isPending ? (
            <Spinner label={t('playground.sending')} />
          ) : !result ? (
            <p className="text-sm text-slate-500">{t('playground.noResponse')}</p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <span
                  className={
                    isError
                      ? 'rounded-full bg-rose-500/15 px-2 py-0.5 text-rose-400'
                      : 'rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-400'
                  }
                >
                  {t('playground.status')}: {result.status}
                </span>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">
                  {t('playground.servedBy')}: {served}
                </span>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">
                  {t('playground.latency')}: {result.latencyMs} ms
                </span>
                {usage ? (
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">
                    {t('playground.tokens')}: {usage.input} → {usage.output}
                  </span>
                ) : null}
              </div>

              {isError ? (
                <pre className="overflow-auto rounded-lg bg-slate-950 p-3 text-sm text-rose-300">
                  {typeof result.body === 'object'
                    ? JSON.stringify(result.body, null, 2)
                    : result.raw}
                </pre>
              ) : (
                <div className="whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-sm text-slate-100">
                  {text || <span className="text-slate-500">{t('playground.noText')}</span>}
                </div>
              )}

              <details className="text-xs text-slate-400">
                <summary className="cursor-pointer">{t('playground.rawResponse')}</summary>
                <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-slate-950 p-3 text-slate-300">
                  {typeof result.body === 'object'
                    ? JSON.stringify(result.body, null, 2)
                    : result.raw}
                </pre>
              </details>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
