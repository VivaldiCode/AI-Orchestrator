import { useMemo, useState, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Bucket, BreakdownItem } from '@ai-orchestrator/shared';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { Card, EmptyState, Select, Spinner, StatCard } from '../components/ui';

const RANGES: Record<string, { ms: number; bucket: Bucket }> = {
  '1h': { ms: 60 * 60 * 1000, bucket: '1m' },
  '24h': { ms: 24 * 60 * 60 * 1000, bucket: '5m' },
  '7d': { ms: 7 * 24 * 60 * 60 * 1000, bucket: '1h' },
  '30d': { ms: 30 * 24 * 60 * 60 * 1000, bucket: '1h' },
};

// Distinct colours cycled for per-node stacked areas.
const NODE_COLORS = [
  '#818cf8',
  '#fbbf24',
  '#34d399',
  '#f472b6',
  '#22d3ee',
  '#a78bfa',
  '#fb7185',
  '#4ade80',
  '#facc15',
  '#60a5fa',
];

const AXIS = { stroke: '#64748b', fontSize: 12 } as const;
const TOOLTIP_STYLE = {
  background: '#0f172a',
  border: '1px solid #1e293b',
  borderRadius: 8,
} as const;

function Breakdown({
  title,
  items,
  labelFor,
}: {
  title: string;
  items: BreakdownItem[];
  labelFor?: (key: string) => string;
}) {
  const { t, fmt } = useI18n();
  const total = items.reduce((a, i) => a + i.requests, 0) || 1;
  return (
    <Card className="p-0">
      <div className="border-b border-slate-800 px-4 py-3 text-sm font-medium text-slate-200">
        {title}
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-3 text-sm text-slate-500">{t('analytics.noData')}</p>
      ) : (
        <ul className="divide-y divide-slate-800">
          {items.map((item) => {
            const share = item.requests / total;
            return (
              <li key={item.key} className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-slate-300">
                    {labelFor ? labelFor(item.key) : item.key}
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-400">{fmt.percent(share)}</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded bg-slate-800">
                  <div
                    className="h-full rounded bg-concert-500"
                    style={{ width: `${Math.round(share * 100)}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-slate-500">
                  <span>{t('analytics.reqUnit', { count: fmt.number(item.requests) })}</span>
                  <span>{fmt.latency(item.avgLatencyMs)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactElement }) {
  return (
    <Card>
      <h2 className="mb-4 text-sm font-medium text-slate-200">{title}</h2>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export function AnalyticsPage() {
  const { t, fmt, lang } = useI18n();
  const [range, setRange] = useState<keyof typeof RANGES>('24h');

  const query = useQuery({
    queryKey: ['analytics', range],
    queryFn: () => {
      const { ms, bucket } = RANGES[range];
      const to = new Date();
      const from = new Date(to.getTime() - ms);
      return api.analytics({ from: from.toISOString(), to: to.toISOString(), bucket });
    },
    refetchInterval: 5_000,
  });

  const nodesQuery = useQuery({ queryKey: ['nodes'], queryFn: api.listNodes });
  const nodeName = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of nodesQuery.data ?? []) m.set(n.id, n.name);
    return (key: string) =>
      m.get(key) ?? (key === 'cloud' ? t('analytics.unknownNode') : key.slice(0, 8));
  }, [nodesQuery.data, t]);

  const multiDay = range === '7d' || range === '30d';
  const label = (iso: string) =>
    multiDay
      ? new Date(iso).toLocaleDateString(lang, { month: '2-digit', day: '2-digit' })
      : new Date(iso).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });

  const series = query.data?.series ?? [];
  const chartData = useMemo(
    () =>
      series.map((p) => ({
        time: label(p.time),
        requests: p.requests,
        errors: p.errors,
        avg: p.avgLatency ?? 0,
        p50: p.p50 ?? 0,
        p95: p.p95 ?? 0,
        p99: p.p99 ?? 0,
        prompt: p.promptTokens,
        completion: p.completionTokens,
      })),
    [query.data, lang, range],
  );

  const nodeSeries = query.data?.nodeSeries ?? [];
  const nodeKeys = query.data?.nodeKeys ?? [];
  const nodeChartData = useMemo(
    () => nodeSeries.map((p) => ({ ...p, time: label(String(p.time)) })),
    [query.data, lang, range],
  );

  const summary = query.data;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-50">{t('analytics.title')}</h1>
          <p className="text-sm text-slate-400">{t('analytics.subtitle')}</p>
        </div>
        <div className="w-36">
          <Select value={range} onChange={(e) => setRange(e.target.value as keyof typeof RANGES)}>
            <option value="1h">{t('analytics.lastHour')}</option>
            <option value="24h">{t('analytics.last24h')}</option>
            <option value="7d">{t('analytics.last7d')}</option>
            <option value="30d">{t('analytics.last30d')}</option>
          </Select>
        </div>
      </header>

      {query.isLoading ? (
        <Spinner label={t('analytics.loading')} />
      ) : query.isError ? (
        <EmptyState title={t('analytics.loadError')} hint={t('analytics.loadErrorHint')} />
      ) : summary ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={t('analytics.requests')} value={fmt.number(summary.totalRequests)} />
            <StatCard
              label={t('analytics.throughput')}
              value={summary.requestsPerMinute.toFixed(summary.requestsPerMinute < 10 ? 2 : 0)}
              hint={t('analytics.perMinute')}
            />
            <StatCard label={t('analytics.errorRate')} value={fmt.percent(summary.errorRate)} />
            <StatCard
              label={t('analytics.totalTokens')}
              value={fmt.number(summary.totalTokens)}
              hint={t('analytics.tokensPerReq', {
                count: fmt.number(Math.round(summary.avgTokensPerRequest)),
              })}
            />
            <StatCard label={t('analytics.avgLatency')} value={fmt.latency(summary.avgLatencyMs)} />
            <StatCard label={t('analytics.minLatency')} value={fmt.latency(summary.minLatencyMs)} />
            <StatCard label={t('analytics.maxLatency')} value={fmt.latency(summary.maxLatencyMs)} />
            <StatCard label={t('analytics.p95')} value={fmt.latency(summary.p95LatencyMs)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title={t('analytics.requestsOverTime')}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gReq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#818cf8" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" {...AXIS} />
                <YAxis {...AXIS} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Area
                  type="monotone"
                  dataKey="requests"
                  name={t('analytics.requests')}
                  stroke="#818cf8"
                  fill="url(#gReq)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="errors"
                  name={t('analytics.errors')}
                  stroke="#fb7185"
                  fill="#fb7185"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
                <Legend />
              </AreaChart>
            </ChartCard>

            <ChartCard title={t('analytics.latencyOverTime')}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" {...AXIS} />
                <YAxis {...AXIS} unit="ms" />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Line type="monotone" dataKey="avg" name="avg" stroke="#34d399" dot={false} />
                <Line type="monotone" dataKey="p50" name="p50" stroke="#818cf8" dot={false} />
                <Line type="monotone" dataKey="p95" name="p95" stroke="#fbbf24" dot={false} />
                <Line type="monotone" dataKey="p99" name="p99" stroke="#fb7185" dot={false} />
                <Legend />
              </LineChart>
            </ChartCard>

            <ChartCard title={t('analytics.tokensOverTime')}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" {...AXIS} />
                <YAxis {...AXIS} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Area
                  type="monotone"
                  dataKey="prompt"
                  name={t('analytics.promptTokens')}
                  stackId="tok"
                  stroke="#22d3ee"
                  fill="#22d3ee"
                  fillOpacity={0.3}
                />
                <Area
                  type="monotone"
                  dataKey="completion"
                  name={t('analytics.completionTokens')}
                  stackId="tok"
                  stroke="#a78bfa"
                  fill="#a78bfa"
                  fillOpacity={0.3}
                />
                <Legend />
              </AreaChart>
            </ChartCard>

            <ChartCard title={t('analytics.requestsByNode')}>
              <AreaChart data={nodeChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" {...AXIS} />
                <YAxis {...AXIS} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                {nodeKeys.map((key, i) => (
                  <Area
                    key={key}
                    type="monotone"
                    dataKey={key}
                    name={nodeName(key)}
                    stackId="nodes"
                    stroke={NODE_COLORS[i % NODE_COLORS.length]}
                    fill={NODE_COLORS[i % NODE_COLORS.length]}
                    fillOpacity={0.5}
                  />
                ))}
                <Legend />
              </AreaChart>
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
            <Breakdown title={t('analytics.byNode')} items={summary.byNode} labelFor={nodeName} />
            <Breakdown title={t('analytics.byModel')} items={summary.byModel} />
            <Breakdown title={t('analytics.byProvider')} items={summary.byProvider} />
            <Breakdown title={t('analytics.byEndpoint')} items={summary.byEndpoint} />
          </div>
        </>
      ) : null}
    </div>
  );
}
