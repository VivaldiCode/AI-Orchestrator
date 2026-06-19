import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ArchiveEntry } from '@ai-orchestrator/shared';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { Card, EmptyState, Spinner } from '../components/ui';

/** First day of the current month, ISO — month-to-date spend window. */
function monthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function money(n: number): string {
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}

export function ProviderDetailPage() {
  const { t } = useI18n();
  const { id = '' } = useParams();

  const isOllama = id === 'ollama';
  const providersQuery = useQuery({ queryKey: ['providers'], queryFn: api.listProviders });
  const realProvider = (providersQuery.data ?? []).find((p) => p.id === id);
  // The local cluster is not a DB row — synthesize it so it gets a detail page.
  const provider: { id: string; name: string; type: string; authMode: string } | undefined =
    isOllama
      ? { id: 'ollama', name: t('providers.localOllama'), type: 'ollama', authMode: 'api-key' }
      : realProvider;
  const type = provider?.type ?? '';

  const pricesQuery = useQuery({ queryKey: ['prices'], queryFn: api.listPrices });
  const rates = (pricesQuery.data ?? []).filter((p) => p.provider === type);

  const balanceQuery = useQuery({
    queryKey: ['provider-balance', id],
    queryFn: () => api.getProviderBalance(id),
    enabled: !!provider && !isOllama,
  });
  const spendQuery = useQuery({
    queryKey: ['provider-spend', type],
    queryFn: () => api.analytics({ provider: type, from: monthStartIso(), bucket: '1d' }),
    enabled: !!provider,
  });
  const promptsQuery = useQuery({
    queryKey: ['provider-archive', type],
    queryFn: () => api.listArchiveByProvider(type, 100),
    enabled: !!provider,
  });

  if (!isOllama && providersQuery.isLoading) return <Spinner label={t('common.loading')} />;
  if (!provider) {
    return (
      <div className="space-y-4">
        <Link to="/providers" className="text-sm text-concert-400">
          {t('providers.back')}
        </Link>
        <EmptyState title={t('providers.notFound')} />
      </div>
    );
  }

  const spend = spendQuery.data;
  const balance = balanceQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/providers" className="text-sm text-concert-400">
          {t('providers.back')}
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-slate-50">{provider.name}</h1>
          <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
            {provider.type}
          </span>
          {provider.authMode === 'subscription' ? (
            <span className="rounded bg-indigo-500/15 px-2 py-0.5 text-xs text-indigo-300">
              subscription
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Pricing (energy cost for the local cluster; configured rates for cloud) */}
        <Card>
          <h2 className="mb-3 text-lg font-medium text-slate-100">{t('providers.pricingTitle')}</h2>
          {rates.length === 0 ? (
            <p className="text-sm text-slate-500">{t('providers.noPricing')}</p>
          ) : (
            <div className="space-y-1 text-sm">
              {rates.map((r) => (
                <div key={r.id} className="flex justify-between gap-2 text-slate-300">
                  <span className="truncate">{r.model}</span>
                  <span className="shrink-0 text-slate-400">
                    ${r.inputPerMtok} / ${r.outputPerMtok}
                  </span>
                </div>
              ))}
              <div className="pt-1 text-xs text-slate-500">{t('providers.perMtokNote')}</div>
            </div>
          )}
        </Card>

        {/* Balance — cloud providers only (the local cluster has no account balance) */}
        {!isOllama ? (
          <Card>
            <h2 className="mb-3 text-lg font-medium text-slate-100">
              {t('providers.balanceTitle')}
            </h2>
            {balanceQuery.isLoading ? (
              <Spinner label={t('common.loading')} />
            ) : balance?.available ? (
              <div>
                <div className="text-3xl font-semibold text-emerald-400">
                  {money(balance.balanceUsd ?? 0)}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {t('providers.balanceLive')}
                  {balance.source ? ` · ${balance.source}` : ''}
                  {balance.note ? ` · ${balance.note}` : ''}
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-400">
                <div>{t('providers.balanceUnavailable')}</div>
                {balance?.note ? (
                  <div className="mt-1 text-xs text-slate-500">{balance.note}</div>
                ) : null}
              </div>
            )}
          </Card>
        ) : null}

        {/* Spend this month */}
        <Card>
          <h2 className="mb-3 text-lg font-medium text-slate-100">{t('providers.spend')}</h2>
          {spendQuery.isLoading ? (
            <Spinner label={t('common.loading')} />
          ) : spend ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label={t('providers.cost')} value={money(spend.totalCostUsd)} accent />
                <Stat label={t('providers.requests')} value={String(spend.totalRequests)} />
                <Stat label={t('providers.tokens')} value={spend.totalTokens.toLocaleString()} />
                <Stat
                  label={t('providers.avgLatency')}
                  value={spend.avgLatencyMs != null ? `${Math.round(spend.avgLatencyMs)} ms` : '—'}
                />
              </div>
              {spend.byModel.length > 0 ? (
                <div>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                    {t('providers.byModel')}
                  </div>
                  <div className="space-y-1 text-sm">
                    {spend.byModel.map((m) => (
                      <div key={m.key} className="flex justify-between gap-2 text-slate-300">
                        <span className="truncate">{m.key || '—'}</span>
                        <span className="shrink-0 text-slate-400">
                          {m.requests}× · {money(m.costUsd)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>
      </div>

      {/* Prompts (archive) */}
      <Card>
        <h2 className="mb-3 text-lg font-medium text-slate-100">{t('providers.promptsTitle')}</h2>
        {promptsQuery.isLoading ? (
          <Spinner label={t('common.loading')} />
        ) : (promptsQuery.data?.items ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">{t('providers.noPrompts')}</p>
        ) : (
          <div className="divide-y divide-slate-800">
            {(promptsQuery.data?.items ?? []).map((e) => (
              <PromptRow key={e.id} entry={e} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-950 p-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div
        className={`mt-0.5 text-lg font-semibold ${accent ? 'text-emerald-400' : 'text-slate-100'}`}
      >
        {value}
      </div>
    </div>
  );
}

function PromptRow({ entry }: { entry: ArchiveEntry }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const date = entry.at.slice(0, 10);
  const bodies = useQuery({
    queryKey: ['archive-body', date, entry.id],
    queryFn: async () => ({
      request: await api.archiveBody(date, entry.id, 'request'),
      response: await api.archiveBody(date, entry.id, 'response'),
    }),
    enabled: open,
  });

  return (
    <div className="py-2 text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="text-slate-500">{open ? '▾' : '▸'}</span>
          <span className="text-slate-400">{new Date(entry.at).toLocaleString()}</span>
          <span className="text-slate-200">{entry.model ?? '—'}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
          <span className={entry.status >= 400 ? 'text-rose-400' : 'text-emerald-400'}>
            {entry.status}
          </span>
          <span>
            {entry.promptTokens ?? 0}→{entry.completionTokens ?? 0} tok
          </span>
          <span>{entry.latencyMs} ms</span>
        </span>
      </button>
      {open ? (
        <div className="mt-2 grid gap-3 lg:grid-cols-2">
          {bodies.isLoading ? (
            <Spinner label={t('common.loading')} />
          ) : (
            <>
              <BodyBlock title={t('providers.request')} text={bodies.data?.request ?? ''} />
              <BodyBlock title={t('providers.response')} text={bodies.data?.response ?? ''} />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function BodyBlock({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{title}</div>
      <pre className="max-h-80 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-300">
        {text || '—'}
      </pre>
    </div>
  );
}
