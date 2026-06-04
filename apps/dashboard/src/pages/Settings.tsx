import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STRATEGIES, type Settings, type Strategy } from '@ai-orchestrator/shared';
import { api } from '../lib/api';
import { Button, Card, Field, Select, Spinner } from '../components/ui';

const STRATEGY_HELP: Record<Strategy, string> = {
  'round-robin': 'Rotate evenly across nodes.',
  weighted: 'Favour higher-weight nodes, adjusted for live load.',
  'least-connections': 'Send to the node with the fewest in-flight requests.',
  'least-latency': 'Send to the fastest-responding node.',
};

export function SettingsPage() {
  const qc = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const [form, setForm] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settingsQuery.data) setForm(settingsQuery.data);
  }, [settingsQuery.data]);

  const save = useMutation({
    mutationFn: (next: Settings) => api.updateSettings(next),
    onSuccess: (next) => {
      qc.setQueryData(['settings'], next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  if (settingsQuery.isLoading || !form) return <Spinner label="Loading settings…" />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-50">Settings</h1>
        <p className="text-sm text-slate-400">Tune how the orchestrator routes requests.</p>
      </header>

      <Card className="max-w-xl space-y-5">
        <Field label="Load-balancing strategy">
          <Select
            value={form.strategy}
            onChange={(e) => setForm({ ...form, strategy: e.target.value as Strategy })}
          >
            {STRATEGIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-slate-500">{STRATEGY_HELP[form.strategy]}</p>
        </Field>

        <label className="flex items-center gap-3 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={form.modelAware}
            onChange={(e) => setForm({ ...form, modelAware: e.target.checked })}
            className="h-4 w-4 accent-concert-500"
          />
          Model-aware routing (only send to nodes that have the model)
        </label>

        <label className="flex items-center gap-3 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={form.autoPull}
            onChange={(e) => setForm({ ...form, autoPull: e.target.checked })}
            className="h-4 w-4 accent-concert-500"
          />
          Auto-pull missing models before routing
        </label>

        <Field label="Failover retries">
          <input
            type="number"
            min={0}
            max={10}
            value={form.failoverRetries}
            onChange={(e) => setForm({ ...form, failoverRetries: Number(e.target.value) })}
            className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-concert-500"
          />
        </Field>

        <div className="flex items-center gap-3">
          <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save settings'}
          </Button>
          {saved ? <span className="text-sm text-emerald-400">Saved ✓</span> : null}
        </div>
      </Card>
    </div>
  );
}
