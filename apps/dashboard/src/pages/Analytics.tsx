import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Bucket, BreakdownItem } from '@ai-orchestrator/shared';
import { api } from '../lib/api';
import { formatLatency, formatNumber, formatPercent } from '../lib/format';
import { Card, EmptyState, Select, Spinner, StatCard } from '../components/ui';

const RANGES: Record<string, { ms: number; bucket: Bucket }> = {
  '1h': { ms: 60 * 60 * 1000, bucket: '1m' },
  '24h': { ms: 24 * 60 * 60 * 1000, bucket: '5m' },
  '7d': { ms: 7 * 24 * 60 * 60 * 1000, bucket: '1h' },
};

function BreakdownTable({ title, items }: { title: string; items: BreakdownItem[] }) {
  return (
    <Card className="p-0">
      <div className="border-b border-slate-800 px-4 py-3 text-sm font-medium text-slate-200">
        {title}
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-3 text-sm text-slate-500">No data.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-800">
            {items.map((item) => (
              <tr key={item.key}>
                <td className="px-4 py-2 text-slate-300">{item.key}</td>
                <td className="px-4 py-2 text-right text-slate-400">
                  {formatNumber(item.requests)} req
                </td>
                <td className="px-4 py-2 text-right text-slate-500">
                  {formatLatency(item.avgLatencyMs)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export function AnalyticsPage() {
  const [range, setRange] = useState<keyof typeof RANGES>('24h');

  const query = useQuery({
    queryKey: ['analytics', range],
    queryFn: () => {
      const { ms, bucket } = RANGES[range];
      const to = new Date();
      const from = new Date(to.getTime() - ms);
      return api.analytics({ from: from.toISOString(), to: to.toISOString(), bucket });
    },
    refetchInterval: 30_000,
  });

  const chartData = useMemo(
    () =>
      (query.data?.series ?? []).map((p) => ({
        time: new Date(p.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        requests: p.requests,
        errors: p.errors,
        p95: p.p95 ?? 0,
      })),
    [query.data],
  );

  const summary = query.data;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-50">Analytics</h1>
          <p className="text-sm text-slate-400">Throughput, latency and usage across the fleet.</p>
        </div>
        <div className="w-32">
          <Select value={range} onChange={(e) => setRange(e.target.value as keyof typeof RANGES)}>
            <option value="1h">Last hour</option>
            <option value="24h">Last 24h</option>
            <option value="7d">Last 7 days</option>
          </Select>
        </div>
      </header>

      {query.isLoading ? (
        <Spinner label="Crunching numbers…" />
      ) : query.isError ? (
        <EmptyState title="Could not load analytics" hint="Is the database reachable?" />
      ) : summary ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Requests" value={formatNumber(summary.totalRequests)} />
            <StatCard label="Error rate" value={formatPercent(summary.errorRate)} />
            <StatCard label="Avg latency" value={formatLatency(summary.avgLatencyMs)} />
            <StatCard label="p95 latency" value={formatLatency(summary.p95LatencyMs)} />
          </div>

          <Card>
            <h2 className="mb-4 text-sm font-medium text-slate-200">Requests over time</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      background: '#0f172a',
                      border: '1px solid #1e293b',
                      borderRadius: 8,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="requests"
                    stroke="#818cf8"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="errors"
                    stroke="#fb7185"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <BreakdownTable title="By node" items={summary.byNode} />
            <BreakdownTable title="By model" items={summary.byModel} />
            <BreakdownTable title="By provider" items={summary.byProvider} />
          </div>
        </>
      ) : null}
    </div>
  );
}
