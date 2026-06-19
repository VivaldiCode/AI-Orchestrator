import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateModelPriceInput,
  CreateProviderInput,
  DeviceLogin,
  ModelEquivalentGroup,
  ModelPrice,
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
  authMode: 'api-key' | 'subscription';
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
  authMode: 'api-key',
};

/** First day of the current month, ISO — month-to-date spend window. */
function monthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** The local Ollama cluster as a pseudo-provider card → its detail page. */
function LocalOllamaCard() {
  const { t } = useI18n();
  const spend = useQuery({
    queryKey: ['provider-spend', 'ollama'],
    queryFn: () => api.analytics({ provider: 'ollama', from: monthStartIso(), bucket: '1d' }),
  });
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <Link to="/providers/ollama" className="font-medium text-slate-100 hover:text-concert-400">
          {t('providers.localOllama')}
        </Link>
        <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">local</span>
      </div>
      <div className="mt-2 space-y-1 text-xs text-slate-500">
        <div>{t('providers.localHint')}</div>
        <div>
          {t('providers.spend')}: ${(spend.data?.totalCostUsd ?? 0).toFixed(2)}
        </div>
      </div>
    </Card>
  );
}

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
        authMode: form.authMode,
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
              onChange={(e) => {
                const type = e.target.value as ProviderType;
                setForm({ ...form, type, authMode: type === 'xai' ? form.authMode : 'api-key' });
              }}
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
              {form.type === 'xai' ? (
                <Field label={t('providers.authMode')}>
                  <Select
                    value={form.authMode}
                    onChange={(e) =>
                      setForm({ ...form, authMode: e.target.value as ProviderForm['authMode'] })
                    }
                  >
                    <option value="api-key">{t('providers.authApiKey')}</option>
                    <option value="subscription">{t('providers.authSubscription')}</option>
                  </Select>
                </Field>
              ) : null}
              {form.authMode === 'subscription' ? (
                <Field label={t('providers.apiKey')}>
                  <p className="text-xs text-slate-400">{t('providers.subscriptionCreateHint')}</p>
                </Field>
              ) : (
                <Field label={t('providers.apiKey')}>
                  <Input
                    type="password"
                    value={form.apiKey}
                    onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  />
                </Field>
              )}
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <LocalOllamaCard />
      </div>

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

      <ModelEquivalenceSection />
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
        <Link
          to={`/providers/${p.id}`}
          className="font-medium text-slate-100 hover:text-concert-400"
        >
          {p.name}
        </Link>
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

      {p.authMode === 'subscription' && p.type === 'xai' ? (
        <XaiSubscriptionPanel provider={p} />
      ) : null}
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
/**
 * xAI subscription (OAuth device flow) panel shown on a subscription-mode xAI
 * provider card: connection status, a Connect button that starts the device
 * flow (showing a user code + verification link and auto-polling for approval),
 * and Disconnect.
 */
function XaiSubscriptionPanel({ provider: p }: { provider: Provider }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const sub = p.subscription;
  const [device, setDevice] = useState<DeviceLogin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };
  useEffect(() => stopPolling, []);

  const start = useMutation({
    mutationFn: () => api.startXaiDevice(p.id),
    onSuccess: (d) => {
      setError(null);
      setDevice(d);
      stopPolling();
      pollRef.current = setInterval(
        () => {
          void api
            .pollXaiDevice(p.id)
            .then((r) => {
              if (r.status === 'pending') return;
              stopPolling();
              setDevice(null);
              if (r.status === 'connected') {
                void qc.invalidateQueries({ queryKey: ['providers'] });
              } else {
                setError(r.message ?? r.status);
              }
            })
            .catch((e: unknown) => {
              stopPolling();
              setDevice(null);
              setError(e instanceof Error ? e.message : 'poll failed');
            });
        },
        Math.max(2, d.intervalSeconds) * 1000,
      );
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : t('providers.subscriptionError')),
  });

  const disconnect = useMutation({
    mutationFn: () => api.disconnectXai(p.id),
    onSuccess: () => {
      setDevice(null);
      void qc.invalidateQueries({ queryKey: ['providers'] });
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : t('providers.subscriptionError')),
  });

  return (
    <div className="mt-3 rounded-md border border-slate-700/60 bg-slate-800/30 p-3 text-xs">
      <div className="mb-2 font-medium text-slate-300">{t('providers.subscription')}</div>
      {sub?.connected ? (
        <div className="space-y-1 text-slate-400">
          <div className="text-emerald-400">
            ● {t('providers.connected')}
            {sub.account ? ` — ${sub.account}` : ''}
          </div>
          {sub.expiresAt ? (
            <div>
              {t('providers.expiresLabel')}: {new Date(sub.expiresAt).toLocaleString()}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="text-slate-400">{t('providers.notConnected')}</div>
      )}

      {device ? (
        <div className="mt-2 space-y-2">
          <p className="text-slate-300">{t('providers.deviceInstructions')}</p>
          <div className="font-mono text-base tracking-widest text-slate-100">
            {device.userCode}
          </div>
          <a
            className="text-indigo-400 underline"
            href={device.verificationUriComplete ?? device.verificationUri}
            target="_blank"
            rel="noreferrer"
          >
            {t('providers.openLink')}
          </a>
          <p className="text-slate-500">{t('providers.deviceWaiting')}</p>
        </div>
      ) : (
        <div className="mt-2 flex gap-2">
          <Button type="button" onClick={() => start.mutate()} disabled={start.isPending}>
            {start.isPending
              ? t('providers.connecting')
              : sub?.connected
                ? t('providers.reconnect')
                : t('providers.connect')}
          </Button>
          {sub?.connected ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
            >
              {t('providers.disconnect')}
            </Button>
          ) : null}
        </div>
      )}
      {error ? <p className="mt-2 text-rose-400">{error}</p> : null}
    </div>
  );
}

const EQUIV_PROVIDER_TYPES: ProviderType[] = ['ollama', ...PROVIDER_TYPES];

/**
 * Manage model equivalence groups: ordered sets of "similar" models across
 * providers. When the local cluster can't serve a model, the request is
 * redirected to the closest model on another provider (top of the list first).
 */
function ModelEquivalenceSection() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const groupsQuery = useQuery({
    queryKey: ['model-equivalents'],
    queryFn: api.listModelEquivalents,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [members, setMembers] = useState<{ providerType: ProviderType; model: string }[]>([
    { providerType: 'ollama', model: '' },
  ]);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['model-equivalents'] });
  const reset = () => {
    setEditingId(null);
    setLabel('');
    setMembers([{ providerType: 'ollama', model: '' }]);
    setError(null);
  };

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        label: label.trim(),
        members: members
          .filter((m) => m.model.trim())
          .map((m) => ({ providerType: m.providerType, model: m.model.trim() })),
      };
      return editingId
        ? api.updateModelEquivalentGroup(editingId, payload)
        : api.createModelEquivalentGroup(payload);
    },
    onSuccess: () => {
      reset();
      invalidate();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : t('providers.editError')),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteModelEquivalentGroup(id),
    onSuccess: invalidate,
  });

  const edit = (g: ModelEquivalentGroup) => {
    setEditingId(g.id);
    setLabel(g.label);
    setMembers(g.members.map((m) => ({ providerType: m.providerType, model: m.model })));
    setError(null);
  };

  const groups = groupsQuery.data ?? [];
  const canSave = label.trim().length > 0 && members.some((m) => m.model.trim());

  return (
    <Card>
      <h2 className="text-lg font-medium text-slate-100">{t('providers.equivTitle')}</h2>
      <p className="mt-1 text-sm text-slate-400">{t('providers.equivSubtitle')}</p>

      {groups.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{t('providers.equivEmpty')}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {groups.map((g) => (
            <div
              key={g.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <div className="font-medium text-slate-200">{g.label}</div>
                <div className="truncate font-mono text-xs text-slate-500">
                  {g.members.map((m) => `${m.providerType}/${m.model}`).join('  →  ')}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="ghost" onClick={() => edit(g)}>
                  {t('providers.edit')}
                </Button>
                <Button variant="danger" onClick={() => remove.mutate(g.id)}>
                  {t('providers.delete')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 space-y-3 border-t border-slate-800 pt-4">
        <Field label={t('providers.equivGroupName')}>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="≈27B class" />
        </Field>
        <p className="text-xs text-slate-500">{t('providers.equivProximityHint')}</p>
        <div className="space-y-2">
          {members.map((m, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-xs text-slate-600">{i + 1}.</span>
              <Select
                value={m.providerType}
                className="w-44"
                onChange={(e) =>
                  setMembers((ms) =>
                    ms.map((x, j) =>
                      j === i ? { ...x, providerType: e.target.value as ProviderType } : x,
                    ),
                  )
                }
              >
                {EQUIV_PROVIDER_TYPES.map((pt) => (
                  <option key={pt} value={pt}>
                    {pt}
                  </option>
                ))}
              </Select>
              <Input
                value={m.model}
                placeholder={t('providers.equivModel')}
                onChange={(e) =>
                  setMembers((ms) => ms.map((x, j) => (j === i ? { ...x, model: e.target.value } : x)))
                }
              />
              <button
                type="button"
                aria-label="remove"
                onClick={() => setMembers((ms) => (ms.length > 1 ? ms.filter((_, j) => j !== i) : ms))}
                className="shrink-0 text-slate-500 hover:text-rose-400"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => setMembers((ms) => [...ms, { providerType: 'openai', model: '' }])}
          >
            {t('providers.equivAddMember')}
          </Button>
          <div className="flex-1" />
          {editingId ? (
            <Button variant="ghost" onClick={reset}>
              {t('providers.cancel')}
            </Button>
          ) : null}
          <Button onClick={() => save.mutate()} disabled={!canSave || save.isPending}>
            {save.isPending
              ? t('providers.saving')
              : editingId
                ? t('providers.save')
                : t('providers.equivAddGroup')}
          </Button>
        </div>
        {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      </div>
    </Card>
  );
}

function PricingSection() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const pricesQuery = useQuery({ queryKey: ['prices'], queryFn: api.listPrices });
  const [form, setForm] = useState<PriceForm>(EMPTY_PRICE);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['prices'] });
  // Stable display order so inline edits never reshuffle rows.
  const prices = [...(pricesQuery.data ?? [])].sort(
    (a, b) => a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model),
  );

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
      ) : prices.length === 0 ? (
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
              {prices.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2 text-slate-300">{p.provider}</td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-400">{p.model}</td>
                  <td className="px-4 py-2 text-right">
                    <PriceRateEdit price={p} field="inputPerMtok" />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <PriceRateEdit price={p} field="outputPerMtok" />
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

/** Inline-editable token rate (USD per 1M); saves on blur/Enter when changed. */
function PriceRateEdit({
  price,
  field,
}: {
  price: ModelPrice;
  field: 'inputPerMtok' | 'outputPerMtok';
}) {
  const qc = useQueryClient();
  const current = price[field];
  const [value, setValue] = useState(String(current));

  const save = useMutation({
    mutationFn: (v: number) =>
      api.updatePrice(
        price.id,
        field === 'inputPerMtok' ? { inputPerMtok: v } : { outputPerMtok: v },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prices'] }),
  });

  const commit = () => {
    const next = Math.max(0, Number(value) || 0);
    setValue(String(next));
    if (next !== current) save.mutate(next);
  };

  return (
    <input
      type="number"
      min={0}
      step="0.01"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      disabled={save.isPending}
      aria-label={field}
      className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-right text-sm text-slate-100 outline-none focus:border-concert-500 disabled:opacity-50"
    />
  );
}
