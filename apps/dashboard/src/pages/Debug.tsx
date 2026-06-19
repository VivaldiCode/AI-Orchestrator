import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DebugEvent } from '@ai-orchestrator/shared';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { Card, EmptyState, Spinner } from '../components/ui';

export function DebugPage() {
  const { t } = useI18n();
  const [errorsOnly, setErrorsOnly] = useState(true);

  const eventsQuery = useQuery({
    queryKey: ['debug-events', errorsOnly],
    queryFn: () => api.debugEvents({ errors: errorsOnly, limit: 150 }),
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
          <span className="shrink-0 text-xs text-slate-600">{e.provider}</span>
          {isError && e.error ? (
            <span className="truncate text-xs text-rose-400">{e.error}</span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-3 text-xs">
          <span className={isError ? 'text-rose-400' : 'text-emerald-400'}>{e.status}</span>
          <span className="text-slate-500">{e.latencyMs != null ? `${Math.round(e.latencyMs)} ms` : '—'}</span>
        </span>
      </button>

      {open ? (
        <div className="mt-2 space-y-3">
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
