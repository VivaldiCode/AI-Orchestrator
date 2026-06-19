import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DebugEvent } from '@ai-orchestrator/shared';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { Card, EmptyState, Input, Spinner } from '../components/ui';

interface Filters {
  ip: string;
  model: string;
  endpoint: string;
  provider: string;
  status: string;
}
const EMPTY: Filters = { ip: '', model: '', endpoint: '', provider: '', status: '' };

export function DebugPage() {
  const { t } = useI18n();
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const set = (k: keyof Filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));
  const hasFilters = errorsOnly || Object.values(filters).some((v) => v.trim());

  const eventsQuery = useQuery({
    queryKey: ['debug-events', errorsOnly, filters],
    queryFn: () =>
      api.debugEvents({
        errors: errorsOnly,
        limit: 200,
        ip: filters.ip.trim() || undefined,
        model: filters.model.trim() || undefined,
        endpoint: filters.endpoint.trim() || undefined,
        provider: filters.provider.trim() || undefined,
        status: Number(filters.status) || undefined,
      }),
    refetchInterval: 8000,
  });
  const events = eventsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-50">{t('debug.title')}</h1>
          <p className="text-sm text-slate-400">{t('debug.subtitle')}</p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={errorsOnly}
            onChange={(e) => setErrorsOnly(e.target.checked)}
            className="h-4 w-4 accent-concert-500"
          />
          {t('debug.errorsOnly')}
        </label>
      </header>

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <Input
          value={filters.ip}
          onChange={(e) => set('ip', e.target.value)}
          placeholder={t('debug.filterByIp')}
          className="w-40"
        />
        <Input
          value={filters.provider}
          onChange={(e) => set('provider', e.target.value)}
          placeholder={t('debug.filterByProvider')}
          className="w-36"
        />
        <Input
          value={filters.model}
          onChange={(e) => set('model', e.target.value)}
          placeholder={t('debug.filterByModel')}
          className="w-40"
        />
        <Input
          value={filters.endpoint}
          onChange={(e) => set('endpoint', e.target.value)}
          placeholder={t('debug.filterByEndpoint')}
          className="w-40"
        />
        <Input
          value={filters.status}
          onChange={(e) => set('status', e.target.value.replace(/\D/g, ''))}
          placeholder={t('debug.filterByStatus')}
          className="w-24"
        />
        {hasFilters ? (
          <button
            type="button"
            onClick={() => {
              setErrorsOnly(false);
              setFilters(EMPTY);
            }}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            {t('debug.clearFilters')}
          </button>
        ) : null}
      </Card>

      {eventsQuery.isLoading ? (
        <Spinner label={t('common.loading')} />
      ) : events.length === 0 ? (
        <EmptyState title={t('debug.noEvents')} />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="divide-y divide-slate-800">
            {events.map((e) => (
              <DebugRow key={e.requestId + e.at} event={e} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function DebugRow({ event: e }: { event: DebugEvent }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const date = e.at.slice(0, 10);
  const isError = e.status >= 400 || !!e.error;
  const servedBy = e.nodeName ?? e.provider;

  const bodies = useQuery({
    queryKey: ['archive-body', date, e.requestId],
    queryFn: async () => ({
      request: await api.archiveBody(date, e.requestId, 'request').catch(() => ''),
      response: await api.archiveBody(date, e.requestId, 'response').catch(() => ''),
    }),
    enabled: open,
    retry: false,
  });

  return (
    <div className="px-4 py-2 text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="text-slate-600">{open ? '▾' : '▸'}</span>
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${isError ? 'bg-rose-400' : 'bg-emerald-400'}`}
          />
          <span className="font-mono text-[11px] tabular-nums text-slate-500">
            {new Date(e.at).toLocaleTimeString()}
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-2 truncate">
          <span className="font-mono text-xs text-slate-400">{e.endpoint}</span>
          <span className="truncate text-slate-200">{e.model || '—'}</span>
          {e.targetModel && e.targetModel !== e.model ? (
            <span
              className="shrink-0 font-mono text-xs text-concert-300"
              title={t('debug.sentToProvider')}
            >
              → {e.targetModel}
            </span>
          ) : null}
          <span className="shrink-0 text-xs text-slate-500" title={t('debug.servedBy')}>
            {servedBy}
          </span>
          {e.clientIp ? (
            <span className="shrink-0 font-mono text-[11px] text-slate-600" title={t('debug.clientIp')}>
              {e.clientIp}
            </span>
          ) : null}
          {isError && e.error ? (
            <span className="truncate text-xs text-rose-400">{e.error}</span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-3 text-xs">
          <span className="text-slate-600">
            {(e.promptTokens ?? 0) + (e.completionTokens ?? 0) || '—'} tok
          </span>
          <span className={isError ? 'text-rose-400' : 'text-emerald-400'}>{e.status}</span>
          <span className="text-slate-500">
            {e.latencyMs != null ? `${Math.round(e.latencyMs)} ms` : '—'}
          </span>
        </span>
      </button>

      {open ? (
        <div className="mt-2 space-y-3">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg bg-slate-950 p-3 text-xs sm:grid-cols-3">
            <Detail label={t('debug.time')} value={new Date(e.at).toLocaleString()} />
            <Detail label={t('debug.clientIp')} value={e.clientIp ?? '—'} mono />
            <Detail label={t('debug.servedBy')} value={servedBy} />
            <Detail label="endpoint" value={e.endpoint} mono />
            <Detail label="model" value={e.model || '—'} mono />
            <Detail label={t('debug.sentToProvider')} value={e.targetModel ?? '—'} mono />
            <Detail label="status" value={String(e.status)} />
            <Detail label="latency" value={e.latencyMs != null ? `${Math.round(e.latencyMs)} ms` : '—'} />
            <Detail
              label={t('debug.tokens')}
              value={`${e.promptTokens ?? 0} / ${e.completionTokens ?? 0}`}
            />
            <Detail label={t('debug.requestId')} value={e.requestId} mono />
          </dl>
          {isError && e.error ? (
            <pre className="overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-rose-300">
              {e.error}
            </pre>
          ) : null}
          {bodies.isLoading ? (
            <Spinner label={t('common.loading')} />
          ) : !bodies.data?.request && !bodies.data?.response ? (
            <p className="text-xs text-slate-500">{t('debug.bodiesUnavailable')}</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              <BodyBlock title={t('providers.request')} text={bodies.data?.request ?? ''} />
              <BodyBlock title={t('providers.response')} text={bodies.data?.response ?? ''} />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex min-w-0 justify-between gap-2">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className={`truncate text-right text-slate-300 ${mono ? 'font-mono' : ''}`}>{value}</dd>
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
