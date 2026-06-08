import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateModelPriceInput,
  CreateProviderInput,
  Provider,
  ProviderType,
  UpdateProviderInput,
} from '@ai-orchestrator/shared';
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

/** Hint shown in the Base URL field, per provider type. */
const BASE_URL_PLACEHOLDER: Partial<Record<ProviderType, string>> = {
  openai: 'https://api.openai.com',
  anthropic: 'https://api.anthropic.com',
  xai: 'https://api.x.ai',
  google: 'https://generativelanguage.googleapis.com',
  mistral: 'https://api.mistral.ai',
  'openai-compatible': 'https://your-endpoint.example/v1',
};

const baseUrlHint = (type: ProviderType): string => BASE_URL_PLACEHOLDER[type] ?? 'https://…';

interface ProviderForm {
  type: ProviderType;
  name: string;
  baseUrl: string;
  region: string;
  defaultModel: string;
  apiKey: string;
  accessKeyId: string;
  secretAccessKey: string;
  budgetMonthlyUsd: string;
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
  budgetMonthlyUsd: '',
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
        ...(form.budgetMonthlyUsd ? { budgetMonthlyUsd: Number(form.budgetMonthlyUsd) } : {}),
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
                  placeholder={baseUrlHint(form.type)}
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
          <Field label={t('providers.budget')}>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.budgetMonthlyUsd}
              onChange={(e) => setForm({ ...form, budgetMonthlyUsd: e.target.value })}
              placeholder="0 = none"
            />
          </Field>
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
            <ProviderCard key={p.id} provider={p} />
          ))}
        </div>
      )}

      <PricingSection />
    </div>
  );
}

interface EditForm {
  name: string;
  baseUrl: string;
  region: string;
  defaultModel: string;
  apiKey: string;
  accessKeyId: string;
  secretAccessKey: string;
  budgetMonthlyUsd: string;
}

function ProviderCard({ provider: p }: { provider: Provider }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['providers'] });
  const isBedrock = p.type === 'bedrock';

  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditForm>({
    name: p.name,
    baseUrl: p.baseUrl ?? '',
    region: p.region ?? '',
    defaultModel: p.defaultModel ?? '',
    apiKey: '',
    accessKeyId: '',
    secretAccessKey: '',
    budgetMonthlyUsd: String(p.budgetMonthlyUsd ?? 0),
  });

  const save = useMutation({
    mutationFn: (input: UpdateProviderInput) => api.updateProvider(p.id, input),
    onSuccess: () => {
      setEditing(false);
      setError(null);
      invalidate();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : t('providers.editError')),
  });

  const toggle = useMutation({
    mutationFn: () => api.updateProvider(p.id, { enabled: !p.enabled }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : t('providers.editError')),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteProvider(p.id),
    onSuccess: invalidate,
    onError: (e: unknown) => setError(e instanceof Error ? e.message : t('providers.editError')),
  });

  const submitEdit = (e: FormEvent) => {
    e.preventDefault();
    const input: UpdateProviderInput = {
      name: edit.name,
      defaultModel: edit.defaultModel,
      budgetMonthlyUsd: Number(edit.budgetMonthlyUsd) || 0,
    };
    if (isBedrock) {
      if (edit.region) input.region = edit.region;
      if (edit.accessKeyId) input.accessKeyId = edit.accessKeyId;
      if (edit.secretAccessKey) input.secretAccessKey = edit.secretAccessKey;
    } else {
      if (edit.baseUrl) input.baseUrl = edit.baseUrl;
      if (edit.apiKey) input.apiKey = edit.apiKey;
    }
    save.mutate(input);
  };

  const confirmDelete = () => {
    if (window.confirm(t('providers.confirmDelete'))) remove.mutate();
  };

  if (editing) {
    return (
      <Card>
        <form onSubmit={submitEdit} className="space-y-3">
          <Field label={t('providers.name')}>
            <Input
              value={edit.name}
              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              required
            />
          </Field>
          <Field label={t('providers.defaultModel')}>
            <Input
              value={edit.defaultModel}
              onChange={(e) => setEdit({ ...edit, defaultModel: e.target.value })}
            />
          </Field>
          {isBedrock ? (
            <>
              <Field label={t('providers.region')}>
                <Input
                  value={edit.region}
                  onChange={(e) => setEdit({ ...edit, region: e.target.value })}
                />
              </Field>
              <Field label={t('providers.accessKeyId')}>
                <Input
                  value={edit.accessKeyId}
                  placeholder={t('providers.apiKeyKeep')}
                  onChange={(e) => setEdit({ ...edit, accessKeyId: e.target.value })}
                />
              </Field>
              <Field label={t('providers.secretAccessKey')}>
                <Input
                  type="password"
                  value={edit.secretAccessKey}
                  placeholder={t('providers.apiKeyKeep')}
                  onChange={(e) => setEdit({ ...edit, secretAccessKey: e.target.value })}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label={t('providers.baseUrl')}>
                <Input
                  value={edit.baseUrl}
                  placeholder={baseUrlHint(p.type)}
                  onChange={(e) => setEdit({ ...edit, baseUrl: e.target.value })}
                />
              </Field>
              <Field label={t('providers.apiKey')}>
                <Input
                  type="password"
                  value={edit.apiKey}
                  placeholder={t('providers.apiKeyKeep')}
                  onChange={(e) => setEdit({ ...edit, apiKey: e.target.value })}
                />
              </Field>
            </>
          )}
          <Field label={t('providers.budget')}>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={edit.budgetMonthlyUsd}
              onChange={(e) => setEdit({ ...edit, budgetMonthlyUsd: e.target.value })}
            />
          </Field>
          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              {t('providers.cancel')}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? t('providers.saving') : t('providers.save')}
            </Button>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card className={p.enabled ? undefined : 'opacity-60'}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-slate-100">{p.name}</span>
        <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">{p.type}</span>
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        <span
          className={
            p.enabled
              ? 'inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-400'
              : 'inline-flex items-center gap-1 rounded-full bg-slate-700/40 px-2 py-0.5 text-slate-400'
          }
        >
          ● {p.enabled ? t('providers.enabled') : t('providers.disabled')}
        </span>
      </div>
      <div className="mt-2 space-y-1 text-xs text-slate-500">
        {p.baseUrl ? <div>{p.baseUrl}</div> : null}
        {p.region ? <div>region: {p.region}</div> : null}
        {p.defaultModel ? <div>model: {p.defaultModel}</div> : null}
        <div>{p.hasCredentials ? t('providers.credStored') : t('providers.noCreds')}</div>
        <div
          className={
            p.budgetMonthlyUsd > 0 && p.spentThisMonthUsd >= p.budgetMonthlyUsd
              ? 'text-rose-400'
              : ''
          }
        >
          {t('providers.spend')}: ${p.spentThisMonthUsd.toFixed(2)}
          {p.budgetMonthlyUsd > 0
            ? ` / $${p.budgetMonthlyUsd.toFixed(2)}`
            : ` (${t('providers.noBudget')})`}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={() => toggle.mutate()} disabled={toggle.isPending}>
          {p.enabled ? t('providers.disable') : t('providers.enable')}
        </Button>
        <Button variant="ghost" onClick={() => setEditing(true)}>
          {t('providers.edit')}
        </Button>
        <Button variant="danger" onClick={confirmDelete} disabled={remove.isPending}>
          {remove.isPending ? t('providers.saving') : t('providers.delete')}
        </Button>
      </div>
      {error ? <p className="mt-3 text-right text-sm text-rose-400">{error}</p> : null}
    </Card>
  );
}

interface PriceForm {
  provider: string;
  model: string;
  inputPerMtok: string;
  outputPerMtok: string;
}

const EMPTY_PRICE: PriceForm = {
  provider: 'openai',
  model: '*',
  inputPerMtok: '',
  outputPerMtok: '',
};

/** Per-model token pricing (USD per 1M tokens) used for cost tracking. */
function PricingSection() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const pricesQuery = useQuery({ queryKey: ['prices'], queryFn: api.listPrices });
  const [form, setForm] = useState<PriceForm>(EMPTY_PRICE);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['prices'] });

  const save = useMutation({
    mutationFn: () => {
      const input: CreateModelPriceInput = {
        provider: form.provider.trim(),
        model: form.model.trim() || '*',
        inputPerMtok: Number(form.inputPerMtok) || 0,
        outputPerMtok: Number(form.outputPerMtok) || 0,
      };
      return api.createPrice(input);
    },
    onSuccess: () => {
      setForm({ ...EMPTY_PRICE, provider: form.provider });
      invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deletePrice(id),
    onSuccess: invalidate,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-medium text-slate-100">{t('pricing.title')}</h2>
        <p className="text-sm text-slate-400">{t('pricing.subtitle')}</p>
      </div>

      <Card>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label={t('pricing.provider')}>
            <Input
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value })}
              placeholder="openai / ollama / …"
              required
            />
          </Field>
          <Field label={t('pricing.model')}>
            <Input
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              placeholder="* = default"
            />
          </Field>
          <Field label={t('pricing.inputRate')}>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.inputPerMtok}
              onChange={(e) => setForm({ ...form, inputPerMtok: e.target.value })}
            />
          </Field>
          <Field label={t('pricing.outputRate')}>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.outputPerMtok}
              onChange={(e) => setForm({ ...form, outputPerMtok: e.target.value })}
            />
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={save.isPending}>
              {t('pricing.save')}
            </Button>
          </div>
        </form>
      </Card>

      {pricesQuery.isLoading ? (
        <Spinner label={t('pricing.loading')} />
      ) : (pricesQuery.data ?? []).length === 0 ? (
        <EmptyState title={t('pricing.empty')} />
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/80 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('pricing.provider')}</th>
                <th className="px-4 py-3">{t('pricing.model')}</th>
                <th className="px-4 py-3 text-right">{t('pricing.inputRate')}</th>
                <th className="px-4 py-3 text-right">{t('pricing.outputRate')}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {(pricesQuery.data ?? []).map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2 text-slate-300">{p.provider}</td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-400">{p.model}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-300">
                    ${p.inputPerMtok}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-300">
                    ${p.outputPerMtok}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button variant="ghost" onClick={() => remove.mutate(p.id)}>
                      {t('providers.delete')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}
