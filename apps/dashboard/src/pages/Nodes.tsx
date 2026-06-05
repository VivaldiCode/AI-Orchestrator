import { Fragment, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateNodeInput, NodeWithRuntime } from '@ai-orchestrator/shared';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import type { TranslationKey } from '../i18n/en';
import { useRealtimeStore } from '../lib/store';
import { formatBytes, formatLatency, statusDot } from '../lib/format';
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
  agentPort: null,
  enabledModels: null,
};

export function NodesPage() {
  const { t, fmt } = useI18n();
  const qc = useQueryClient();
  const nodesQuery = useQuery({ queryKey: ['nodes'], queryFn: api.listNodes });
  const runtime = useRealtimeStore((s) => s.runtime);
  const [form, setForm] = useState<CreateNodeInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

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

  const saveModels = useMutation({
    mutationFn: (vars: { id: string; enabledModels: string[] | null }) =>
      api.updateNode(vars.id, { enabledModels: vars.enabledModels }),
    onSuccess: () => {
      setExpanded(null);
      invalidate();
    },
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
          <Field label={t('nodes.agentPort')}>
            <Input
              type="number"
              value={form.agentPort ?? ''}
              onChange={(e) =>
                setForm({ ...form, agentPort: e.target.value ? Number(e.target.value) : null })
              }
              placeholder="4127"
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
                <th className="px-4 py-3">{t('nodes.colSystem')}</th>
                <th className="px-4 py-3">{t('nodes.colMaxConc')}</th>
                <th className="px-4 py-3 text-right">{t('nodes.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {nodes.map((n) => (
                <Fragment key={n.id}>
                  <tr>
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
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {n.runtime.system ? (
                        <>
                          <div>CPU {Math.round((n.runtime.system.cpu ?? 0) * 100)}%</div>
                          <div>
                            {formatBytes(n.runtime.system.memUsed)} /{' '}
                            {formatBytes(n.runtime.system.memTotal)}
                          </div>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <MaxConcurrencyEdit node={n} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          onClick={() => setExpanded(expanded === n.id ? null : n.id)}
                        >
                          {t('nodes.models')}
                        </Button>
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
                  {expanded === n.id ? (
                    <tr>
                      <td colSpan={8} className="p-0">
                        <ModelsPanel
                          node={n}
                          saving={saveModels.isPending}
                          onSave={(enabledModels) => saveModels.mutate({ id: n.id, enabledModels })}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

/** Inline editor for a node's max concurrency; saves on blur/Enter when changed. */
function MaxConcurrencyEdit({ node }: { node: NodeWithRuntime }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [value, setValue] = useState(String(node.maxConcurrency));

  const save = useMutation({
    mutationFn: (max: number) => api.updateNode(node.id, { maxConcurrency: max }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nodes'] }),
  });

  const commit = () => {
    const next = Math.max(1, Math.min(1024, Math.round(Number(value) || node.maxConcurrency)));
    setValue(String(next));
    if (next !== node.maxConcurrency) save.mutate(next);
  };

  return (
    <input
      type="number"
      min={1}
      max={1024}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      disabled={save.isPending}
      title={t('nodes.maxConcurrency')}
      aria-label={t('nodes.maxConcurrency')}
      className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 outline-none focus:border-concert-500 disabled:opacity-50"
    />
  );
}

/** Compact token count: 8192 → "8K", 131072 → "131K". */
function formatCtx(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}K` : String(n);
}

/**
 * Per-node model allowlist editor. When "restrict" is off the node serves any
 * model it has; when on, only the checked models are eligible for routing.
 * Shows the discovered context window per model (used by context-aware routing).
 */
function ModelsPanel({
  node,
  onSave,
  saving,
}: {
  node: NodeWithRuntime;
  onSave: (enabledModels: string[] | null) => void;
  saving: boolean;
}) {
  const { t } = useI18n();
  const available = node.runtime.models ?? [];
  const ctx = node.runtime.modelContext ?? {};
  // Union of live models + any already-allowlisted ones (which may be offline).
  const all = [...new Set([...available, ...(node.enabledModels ?? [])])].sort();
  const [restrict, setRestrict] = useState(node.enabledModels != null);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(node.enabledModels ?? available),
  );

  const toggleModel = (model: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });

  return (
    <div className="space-y-3 border-t border-slate-800 bg-slate-900/40 px-4 py-4">
      <label className="flex items-center gap-3 text-sm text-slate-200">
        <input
          type="checkbox"
          checked={restrict}
          onChange={(e) => setRestrict(e.target.checked)}
          className="h-4 w-4 accent-concert-500"
        />
        {t('nodes.restrictModels')}
      </label>
      <p className="text-xs text-slate-500">{t('nodes.restrictHint')}</p>

      {all.length === 0 ? (
        <p className="text-xs text-slate-500">{t('nodes.noModelsDiscovered')}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {all.map((model) => {
            const offline = !available.includes(model);
            const ctxLen = ctx[model];
            return (
              <li key={model}>
                <label
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2',
                    restrict
                      ? 'border-slate-700 bg-slate-950'
                      : 'border-slate-800 bg-slate-900/40 opacity-60',
                  )}
                >
                  <input
                    type="checkbox"
                    disabled={!restrict}
                    checked={!restrict || selected.has(model)}
                    onChange={() => toggleModel(model)}
                    className="h-4 w-4 accent-concert-500"
                  />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-200">
                    {model}
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-500">
                    {ctxLen
                      ? t('nodes.ctxLabel', { tokens: formatCtx(ctxLen) })
                      : t('nodes.ctxUnknown')}
                    {offline ? ` · ${t('nodes.offlineModel')}` : ''}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={() => onSave(restrict ? [...selected] : null)} disabled={saving}>
          {saving ? t('nodes.addingButton') : t('nodes.saveModels')}
        </Button>
        {!restrict ? <span className="text-xs text-slate-500">{t('nodes.allModels')}</span> : null}
      </div>
    </div>
  );
}
