import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STRATEGIES, type Settings, type Strategy } from '@ai-orchestrator/shared';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import type { TranslationKey } from '../i18n/en';
import { Button, Card, Field, Input, Select, Spinner } from '../components/ui';

export function SettingsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const providersQuery = useQuery({ queryKey: ['providers'], queryFn: api.listProviders });
  const [form, setForm] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

  const OPENAI_FAMILY = ['openai', 'xai', 'openai-compatible', 'mistral', 'google'];
  const overflowEligible = (providersQuery.data ?? []).filter(
    (p) => p.enabled && OPENAI_FAMILY.includes(p.type) && p.hasCredentials && p.defaultModel,
  );

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

  if (settingsQuery.isLoading || !form) return <Spinner label={t('settings.loading')} />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-50">{t('settings.title')}</h1>
        <p className="text-sm text-slate-400">{t('settings.subtitle')}</p>
      </header>

      <Card className="max-w-xl space-y-5">
        <Field label={t('settings.strategy')}>
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
          <p className="mt-1 text-xs text-slate-500">
            {t(`strategy.${form.strategy}` as TranslationKey)}
          </p>
        </Field>

        <label className="flex items-center gap-3 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={form.modelAware}
            onChange={(e) => setForm({ ...form, modelAware: e.target.checked })}
            className="h-4 w-4 accent-concert-500"
          />
          {t('settings.modelAware')}
        </label>

        <label className="flex items-center gap-3 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={form.contextAware}
            onChange={(e) => setForm({ ...form, contextAware: e.target.checked })}
            className="h-4 w-4 accent-concert-500"
          />
          {t('settings.contextAware')}
        </label>

        <label className="flex items-center gap-3 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={form.autoPull}
            onChange={(e) => setForm({ ...form, autoPull: e.target.checked })}
            className="h-4 w-4 accent-concert-500"
          />
          {t('settings.autoPull')}
        </label>

        <Field label={t('settings.failoverRetries')}>
          <input
            type="number"
            min={0}
            max={10}
            value={form.failoverRetries}
            onChange={(e) => setForm({ ...form, failoverRetries: Number(e.target.value) })}
            className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-concert-500"
          />
        </Field>

        <div className="border-t border-slate-800 pt-5">
          <label className="flex items-center gap-3 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={form.triageEnabled}
              onChange={(e) => setForm({ ...form, triageEnabled: e.target.checked })}
              className="h-4 w-4 accent-concert-500"
            />
            {t('settings.triageEnabled')}
          </label>
          {form.triageEnabled ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label={t('settings.triageModel')}>
                <Input
                  value={form.triageModel}
                  onChange={(e) => setForm({ ...form, triageModel: e.target.value })}
                  placeholder="llama3.2"
                />
              </Field>
              <Field label={t('settings.maxToolCalls')}>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={form.maxToolCalls}
                  onChange={(e) => setForm({ ...form, maxToolCalls: Number(e.target.value) })}
                  className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-concert-500"
                />
              </Field>
            </div>
          ) : null}
        </div>

        <div className="border-t border-slate-800 pt-5">
          <label className="flex items-start gap-3 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={form.cloudOverflow}
              onChange={(e) => setForm({ ...form, cloudOverflow: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-concert-500"
            />
            {t('settings.cloudOverflow')}
          </label>
          {form.cloudOverflow ? (
            <div className="mt-4 space-y-2">
              <Field label={t('settings.cloudOverflowProvider')}>
                <Select
                  value={form.cloudOverflowProviderId}
                  onChange={(e) => setForm({ ...form, cloudOverflowProviderId: e.target.value })}
                >
                  <option value="">{t('settings.cloudOverflowAuto')}</option>
                  {overflowEligible.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.type})
                    </option>
                  ))}
                </Select>
              </Field>
              <p className="text-xs text-slate-500">{t('settings.cloudOverflowHint')}</p>
            </div>
          ) : null}
        </div>

        <div className="border-t border-slate-800 pt-5">
          <label className="flex items-start gap-3 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={form.privacyMode}
              onChange={(e) => setForm({ ...form, privacyMode: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-concert-500"
            />
            {t('settings.privacyMode')}
          </label>
          <p className="mt-2 text-xs text-slate-500">{t('settings.privacyModeHint')}</p>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
            {save.isPending ? t('settings.savingButton') : t('settings.saveButton')}
          </Button>
          {saved ? <span className="text-sm text-emerald-400">{t('settings.saved')}</span> : null}
        </div>
      </Card>
    </div>
  );
}
