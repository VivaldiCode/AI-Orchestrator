import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateProviderInput, ProviderType } from '@ai-orchestrator/shared';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { Button, Card, EmptyState, Field, Input, Select, Spinner } from '../components/ui';

const PROVIDER_TYPES: ProviderType[] = [
  'openai',
  'anthropic',
  'xai',
  'bedrock',
  'google',
  'mistral',
  'openai-compatible',
];

interface ProviderForm {
  type: ProviderType;
  name: string;
  baseUrl: string;
  region: string;
  defaultModel: string;
  apiKey: string;
  accessKeyId: string;
  secretAccessKey: string;
}

const EMPTY: ProviderForm = {
  type: 'openai',
  name: '',
  baseUrl: '',
  region: '',
  defaultModel: '',
  apiKey: '',
  accessKeyId: '',
  secretAccessKey: '',
};

export function ProvidersPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const providersQuery = useQuery({ queryKey: ['providers'], queryFn: api.listProviders });
  const [form, setForm] = useState<ProviderForm>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['providers'] });

  const create = useMutation({
    mutationFn: () => {
      const input: CreateProviderInput = {
        type: form.type,
        name: form.name,
        enabled: true,
        ...(form.baseUrl ? { baseUrl: form.baseUrl } : {}),
        ...(form.region ? { region: form.region } : {}),
        ...(form.defaultModel ? { defaultModel: form.defaultModel } : {}),
        ...(form.apiKey ? { apiKey: form.apiKey } : {}),
        ...(form.accessKeyId ? { accessKeyId: form.accessKeyId } : {}),
        ...(form.secretAccessKey ? { secretAccessKey: form.secretAccessKey } : {}),
      };
      return api.createProvider(input);
    },
    onSuccess: () => {
      setForm(EMPTY);
      setError(null);
      invalidate();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : t('providers.addError')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteProvider(id),
    onSuccess: invalidate,
  });

  const isBedrock = form.type === 'bedrock';
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-50">{t('providers.title')}</h1>
        <p className="text-sm text-slate-400">{t('providers.subtitle')}</p>
      </header>

      <Card>
        <h2 className="mb-4 text-lg font-medium text-slate-100">{t('providers.addProvider')}</h2>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t('providers.type')}>
            <Select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as ProviderType })}
            >
              {PROVIDER_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('providers.name')}>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </Field>
          <Field label={t('providers.defaultModel')}>
            <Input
              value={form.defaultModel}
              onChange={(e) => setForm({ ...form, defaultModel: e.target.value })}
            />
          </Field>
          {isBedrock ? (
            <>
              <Field label={t('providers.region')}>
                <Input
                  value={form.region}
                  onChange={(e) => setForm({ ...form, region: e.target.value })}
                />
              </Field>
              <Field label={t('providers.accessKeyId')}>
                <Input
                  value={form.accessKeyId}
                  onChange={(e) => setForm({ ...form, accessKeyId: e.target.value })}
                />
              </Field>
              <Field label={t('providers.secretAccessKey')}>
                <Input
                  type="password"
                  value={form.secretAccessKey}
                  onChange={(e) => setForm({ ...form, secretAccessKey: e.target.value })}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label={t('providers.baseUrl')}>
                <Input
                  value={form.baseUrl}
                  onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                  placeholder="https://api.openai.com"
                />
              </Field>
              <Field label={t('providers.apiKey')}>
                <Input
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                />
              </Field>
            </>
          )}
          <div className="flex items-end">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? t('providers.addingButton') : t('providers.addButton')}
            </Button>
          </div>
        </form>
        {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}
      </Card>

      {providersQuery.isLoading ? (
        <Spinner label={t('providers.loading')} />
      ) : (providersQuery.data ?? []).length === 0 ? (
        <EmptyState title={t('providers.noProviders')} hint={t('providers.noProvidersHint')} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(providersQuery.data ?? []).map((p) => (
            <Card key={p.id}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-100">{p.name}</span>
                <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                  {p.type}
                </span>
              </div>
              <div className="mt-2 space-y-1 text-xs text-slate-500">
                {p.baseUrl ? <div>{p.baseUrl}</div> : null}
                {p.region ? <div>region: {p.region}</div> : null}
                {p.defaultModel ? <div>model: {p.defaultModel}</div> : null}
                <div>{p.hasCredentials ? t('providers.credStored') : t('providers.noCreds')}</div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button variant="danger" onClick={() => remove.mutate(p.id)}>
                  {t('providers.delete')}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
