import { useQuery } from '@tanstack/react-query';
import type { NodeWithRuntime } from '@ai-orchestrator/shared';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import type { TranslationKey } from '../i18n/en';
import { useRealtimeStore } from '../lib/store';
import { statusDot } from '../lib/format';
import { Card, cn, EmptyState, Spinner, StatCard } from '../components/ui';

function NodeLiveCard({ node }: { node: NodeWithRuntime }) {
  const { t, fmt } = useI18n();
  const { runtime } = node;
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn('h-2.5 w-2.5 rounded-full', statusDot(runtime.status))} />
          <span className="font-medium text-slate-100">{node.name}</span>
        </div>
        <span className="text-xs uppercase tracking-wide text-slate-500">
          {t(`status.${runtime.status}` as TranslationKey)}
        </span>
      </div>
      <div className="mt-1 text-xs text-slate-500">
        {node.protocol}://{node.host}:{node.port}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-lg font-semibold text-concert-300">{runtime.inFlight}</div>
          <div className="text-[10px] uppercase text-slate-500">{t('overview.cardInFlight')}</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-slate-100">
            {fmt.latency(runtime.latencyMs)}
          </div>
          <div className="text-[10px] uppercase text-slate-500">{t('overview.cardLatency')}</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-slate-100">{runtime.models.length}</div>
          <div className="text-[10px] uppercase text-slate-500">{t('overview.cardModels')}</div>
        </div>
      </div>
    </Card>
  );
}

export function OverviewPage() {
  const { t, fmt } = useI18n();
  const nodesQuery = useQuery({
    queryKey: ['nodes'],
    queryFn: api.listNodes,
    refetchInterval: 15_000,
  });
  const runtime = useRealtimeStore((s) => s.runtime);
  const events = useRealtimeStore((s) => s.events);

  const nodes = (nodesQuery.data ?? []).map((n) => ({ ...n, runtime: runtime[n.id] ?? n.runtime }));
  const online = nodes.filter((n) => n.runtime.status === 'up').length;
  const inFlight = nodes.reduce((acc, n) => acc + (n.runtime.inFlight || 0), 0);
  const totalRequests = nodes.reduce((acc, n) => acc + (n.runtime.totalRequests || 0), 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-50">{t('overview.title')}</h1>
        <p className="text-sm text-slate-400">{t('overview.subtitle')}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('overview.nodesOnline')} value={`${online}/${nodes.length}`} />
        <StatCard label={t('overview.inFlight')} value={inFlight} />
        <StatCard label={t('overview.served')} value={fmt.number(totalRequests)} />
        <StatCard
          label={t('overview.liveEvents')}
          value={events.length}
          hint={t('overview.liveEventsHint')}
        />
      </div>

      <section>
        <h2 className="mb-3 text-lg font-medium text-slate-100">{t('overview.nodes')}</h2>
        {nodesQuery.isLoading ? (
          <Spinner label={t('nodes.loading')} />
        ) : nodes.length === 0 ? (
          <EmptyState title={t('overview.noNodes')} hint={t('overview.noNodesHint')} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {nodes.map((n) => (
              <NodeLiveCard key={n.id} node={n} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-slate-100">{t('overview.liveRequests')}</h2>
        <Card className="overflow-hidden p-0">
          {events.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">{t('overview.noRequests')}</p>
          ) : (
            <ul className="max-h-80 divide-y divide-slate-800 overflow-auto text-sm">
              {events.slice(0, 40).map((e, i) => (
                <li
                  key={`${e.id}-${e.phase}-${i}`}
                  className="flex items-center justify-between px-4 py-2"
                >
                  <span className="flex items-center gap-2 truncate">
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        e.phase === 'start'
                          ? 'bg-concert-400'
                          : (e.status ?? 0) >= 400
                            ? 'bg-rose-400'
                            : 'bg-emerald-400',
                      )}
                    />
                    <span className="font-mono text-xs text-slate-400">{e.endpoint}</span>
                    <span className="text-slate-300">{e.model || '—'}</span>
                    <span className="text-xs text-slate-600">{e.provider}</span>
                  </span>
                  <span className="text-slate-500">
                    {e.phase === 'end' ? fmt.latency(e.latencyMs) : '…'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
