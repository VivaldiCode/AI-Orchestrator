import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateNodeInput } from '@ai-orchestrator/shared';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import type { TranslationKey } from '../i18n/en';
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
  const { t, fmt } = useI18n();
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
    onError: (e: unknown) => setError(e instanceof Error ? e.message : t('nodes.addError')),
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
          ? t('nodes.testOk', {
              latency: formatLatency(res.latencyMs),
              count: res.models?.length ?? 0,
            })
          : t('nodes.testError', { error: res.error ?? '' }),
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
        <h1 className="text-2xl font-semibold text-slate-50">{t('nodes.title')}</h1>
        <p className="text-sm text-slate-400">{t('nodes.subtitle')}</p>
      </header>

      <Card>
        <h2 className="mb-4 text-lg font-medium text-slate-100">{t('nodes.addNode')}</h2>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t('nodes.name')}>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </Field>
          <Field label={t('nodes.host')}>
            <Input
              value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })}
              placeholder="192.168.0.21"
              required
            />
          </Field>
          <Field label={t('nodes.port')}>
            <Input
              type="number"
              value={form.port}
              onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
            />
          </Field>
          <Field label={t('nodes.weight')}>
            <Input
              type="number"
              min={1}
              value={form.weight}
              onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })}
            />
          </Field>
          <Field label={t('nodes.maxConcurrency')}>
            <Input
              type="number"
              min={1}
              value={form.maxConcurrency}
              onChange={(e) => setForm({ ...form, maxConcurrency: Number(e.target.value) })}
            />
          </Field>
          <Field label={t('nodes.tags')}>
            <Input
              value={form.tags.join(', ')}
              onChange={(e) =>
                setForm({
                  ...form,
                  tags: e.target.value
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? t('nodes.addingButton') : t('nodes.addButton')}
            </Button>
          </div>
        </form>
        {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}
      </Card>

      {nodesQuery.isLoading ? (
        <Spinner label={t('nodes.loading')} />
      ) : nodes.length === 0 ? (
        <EmptyState title={t('nodes.noNodes')} hint={t('nodes.noNodesHint')} />
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/80 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('nodes.colNode')}</th>
                <th className="px-4 py-3">{t('nodes.colEndpoint')}</th>
                <th className="px-4 py-3">{t('nodes.colStatus')}</th>
                <th className="px-4 py-3">{t('nodes.colInFlight')}</th>
                <th className="px-4 py-3">{t('nodes.colLatency')}</th>
                <th className="px-4 py-3 text-right">{t('nodes.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {nodes.map((n) => (
                <tr key={n.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-100">{n.name}</div>
                    <div className="text-xs text-slate-500">
                      {t('nodes.weightLabel', { weight: n.weight })}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">
                    {n.protocol}://{n.host}:{n.port}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2">
                      <span className={cn('h-2 w-2 rounded-full', statusDot(n.runtime.status))} />
                      {t(`status.${n.runtime.status}` as TranslationKey)}
                    </span>
                    {testResult[n.id] ? (
                      <div className="mt-1 text-xs text-slate-500">{testResult[n.id]}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{n.runtime.inFlight}</td>
                  <td className="px-4 py-3">{fmt.latency(n.runtime.latencyMs)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" onClick={() => test.mutate(n.id)}>
                        {t('nodes.test')}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => toggle.mutate({ id: n.id, enabled: !n.enabled })}
                      >
                        {n.enabled ? t('nodes.disable') : t('nodes.enable')}
                      </Button>
                      <Button variant="danger" onClick={() => remove.mutate(n.id)}>
                        {t('nodes.delete')}
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
