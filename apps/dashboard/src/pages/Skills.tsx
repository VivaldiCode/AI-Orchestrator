import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import type { TranslationKey } from '../i18n/en';
import { Button, Card, EmptyState, Field, Input, Spinner } from '../components/ui';

const EMPTY = {
  name: '',
  description: '',
  systemPrompt: '',
  modelHint: '',
  toolPreset: '',
};

const splitCsv = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

const textareaCls =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-concert-500';

export function SkillsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const skillsQuery = useQuery({ queryKey: ['skills'], queryFn: api.listSkills });
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['skills'] });
  const fail = (e: unknown, k: TranslationKey) => setError(e instanceof Error ? e.message : t(k));

  const create = useMutation({
    mutationFn: () =>
      api.createSkill({
        name: form.name,
        description: form.description,
        systemPrompt: form.systemPrompt,
        modelHint: form.modelHint || null,
        toolPreset: splitCsv(form.toolPreset),
        enabled: true,
      }),
    onSuccess: () => {
      setForm(EMPTY);
      setError(null);
      invalidate();
    },
    onError: (e: unknown) => fail(e, 'skills.addError'),
  });

  const toggle = useMutation({
    mutationFn: (vars: { id: string; enabled: boolean }) =>
      api.updateSkill(vars.id, { enabled: vars.enabled }),
    onSuccess: invalidate,
    onError: (e: unknown) => fail(e, 'skills.updateError'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteSkill(id),
    onSuccess: invalidate,
    onError: (e: unknown) => fail(e, 'skills.deleteError'),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  const skills = skillsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-50">{t('skills.title')}</h1>
        <p className="text-sm text-slate-400">{t('skills.subtitle')}</p>
      </header>

      <Card>
        <h2 className="mb-4 text-lg font-medium text-slate-100">{t('skills.addSkill')}</h2>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={t('skills.name')}>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="sql-analyst"
                required
              />
            </Field>
            <Field label={t('skills.modelHint')}>
              <Input
                value={form.modelHint}
                onChange={(e) => setForm({ ...form, modelHint: e.target.value })}
                placeholder="llama3.2"
              />
            </Field>
            <Field label={t('skills.toolPreset')}>
              <Input
                value={form.toolPreset}
                onChange={(e) => setForm({ ...form, toolPreset: e.target.value })}
                placeholder="query_db, list_tables"
              />
            </Field>
          </div>
          <Field label={t('skills.description')}>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <Field label={t('skills.systemPrompt')}>
            <textarea
              value={form.systemPrompt}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
              rows={4}
              className={textareaCls}
              required
            />
          </Field>
          <div>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? t('skills.addingButton') : t('skills.addButton')}
            </Button>
          </div>
        </form>
        {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}
      </Card>

      {skillsQuery.isLoading ? (
        <Spinner label={t('skills.loading')} />
      ) : skills.length === 0 ? (
        <EmptyState title={t('skills.noSkills')} hint={t('skills.noSkillsHint')} />
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/80 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('skills.colSkill')}</th>
                <th className="px-4 py-3">{t('skills.colModel')}</th>
                <th className="px-4 py-3">{t('skills.colTools')}</th>
                <th className="px-4 py-3">{t('skills.colStatus')}</th>
                <th className="px-4 py-3 text-right">{t('skills.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {skills.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-100">{s.name}</div>
                    {s.description ? (
                      <div className="text-xs text-slate-500">{s.description}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{s.modelHint || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {s.toolPreset.length ? s.toolPreset.join(', ') : t('skills.allTools')}
                  </td>
                  <td className="px-4 py-3">
                    {s.enabled ? (
                      <span className="text-emerald-400">{t('skills.enabledLabel')}</span>
                    ) : (
                      <span className="text-slate-500">{t('skills.disabledLabel')}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        onClick={() => toggle.mutate({ id: s.id, enabled: !s.enabled })}
                      >
                        {s.enabled ? t('skills.disable') : t('skills.enable')}
                      </Button>
                      <Button variant="danger" onClick={() => remove.mutate(s.id)}>
                        {t('skills.delete')}
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
