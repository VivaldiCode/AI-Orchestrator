import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateNodeInput } from '@ai-orchestrator/shared';
import { api } from '../lib/api';
import { useRealtimeStore } from '../lib/store';
import { formatLatency, statusDot } from '../lib/format';
import { Button, Card, cn, EmptyState, Field, Input, Spinner } from '../components/ui';

const EMPTY: CreateNodeInput = {
  name: '',
  host: '',
  port: 11434,
  protocol: 'http',
  weight: 1,
  enabled: true,
  maxConcurrency: 4,
  tags: [],
};

export function NodesPage() {
  const qc = useQueryClient();
  const nodesQuery = useQuery({ queryKey: ['nodes'], queryFn: api.listNodes });
  const runtime = useRealtimeStore((s) => s.runtime);
  const [form, setForm] = useState<CreateNodeInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  const invalidate = () => qc.invalidateQueries({ queryKey: ['nodes'] });

  const create = useMutation({
    mutationFn: () => api.createNode(form),
    onSuccess: () => {
      setForm(EMPTY);
      setError(null);
      invalidate();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Failed to add node'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteNode(id),
    onSuccess: invalidate,
  });

  const toggle = useMutation({
    mutationFn: (vars: { id: string; enabled: boolean }) =>
      api.updateNode(vars.id, { enabled: vars.enabled }),
    onSuccess: invalidate,
  });

  const test = useMutation({
    mutationFn: (id: string) => api.testNode(id),
    onSuccess: (res, id) =>
      setTestResult((prev) => ({
        ...prev,
        [id]: res.ok
          ? `OK · ${formatLatency(res.latencyMs)} · ${res.models?.length ?? 0} models`
          : `Error: ${res.error}`,
      })),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  const nodes = (nodesQuery.data ?? []).map((n) => ({ ...n, runtime: runtime[n.id] ?? n.runtime }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-50">Nodes</h1>
        <p className="text-sm text-slate-400">Register the Macs running Ollama.</p>
      </header>

      <Card>
        <h2 className="mb-4 text-lg font-medium text-slate-100">Add a node</h2>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </Field>
          <Field label="Host / IP">
            <Input
              value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })}
              placeholder="192.168.0.21"
              required
            />
          </Field>
          <Field label="Port">
            <Input
              type="number"
              value={form.port}
              onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
            />
          </Field>
          <Field label="Weight">
            <Input
              type="number"
              min={1}
              value={form.weight}
              onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })}
            />
          </Field>
          <Field label="Max concurrency">
            <Input
              type="number"
              min={1}
              value={form.maxConcurrency}
              onChange={(e) => setForm({ ...form, maxConcurrency: Number(e.target.value) })}
            />
          </Field>
          <Field label="Tags (comma-separated)">
            <Input
              value={form.tags.join(', ')}
              onChange={(e) =>
                setForm({
                  ...form,
                  tags: e.target.value
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Adding…' : 'Add node'}
            </Button>
          </div>
        </form>
        {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}
      </Card>

      {nodesQuery.isLoading ? (
        <Spinner label="Loading nodes…" />
      ) : nodes.length === 0 ? (
        <EmptyState title="No nodes registered" hint="Add one above to start load-balancing." />
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/80 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Node</th>
                <th className="px-4 py-3">Endpoint</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">In-flight</th>
                <th className="px-4 py-3">Latency</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {nodes.map((n) => (
                <tr key={n.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-100">{n.name}</div>
                    <div className="text-xs text-slate-500">weight {n.weight}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">
                    {n.protocol}://{n.host}:{n.port}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2">
                      <span className={cn('h-2 w-2 rounded-full', statusDot(n.runtime.status))} />
                      {n.runtime.status}
                    </span>
                    {testResult[n.id] ? (
                      <div className="mt-1 text-xs text-slate-500">{testResult[n.id]}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{n.runtime.inFlight}</td>
                  <td className="px-4 py-3">{formatLatency(n.runtime.latencyMs)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" onClick={() => test.mutate(n.id)}>
                        Test
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => toggle.mutate({ id: n.id, enabled: !n.enabled })}
                      >
                        {n.enabled ? 'Disable' : 'Enable'}
                      </Button>
                      <Button variant="danger" onClick={() => remove.mutate(n.id)}>
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
