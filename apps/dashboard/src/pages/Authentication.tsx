import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  oauthProviderTypeSchema,
  roleSchema,
  type OAuthProvider,
  type OAuthProviderType,
  type Role,
} from '@ai-orchestrator/shared';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import type { TranslationKey } from '../i18n/en';
import { Button, Card, EmptyState, Field, Input, Select, Spinner } from '../components/ui';

const TYPES = oauthProviderTypeSchema.options;
const ROLES = roleSchema.options;

/** Convenience issuer presets per provider kind (editable). */
const ISSUER_PRESETS: Record<OAuthProviderType, string> = {
  google: 'https://accounts.google.com',
  microsoft: 'https://login.microsoftonline.com/common/v2.0',
  okta: '',
  oidc: '',
};

const EMPTY = {
  type: 'oidc' as OAuthProviderType,
  displayName: '',
  issuer: '',
  clientId: '',
  clientSecret: '',
  scopes: 'openid, email, profile',
  allowedDomains: '',
  defaultRole: 'viewer' as Role,
  enabled: true,
  requireVerifiedEmail: true,
};

const splitCsv = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

export function AuthenticationPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const providersQuery = useQuery({
    queryKey: ['oauth-providers'],
    queryFn: api.listOAuthProviders,
  });
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['oauth-providers'] });
  const fail = (e: unknown, fallback: TranslationKey) =>
    setError(e instanceof Error ? e.message : t(fallback));
  const reset = () => {
    setForm(EMPTY);
    setEditingId(null);
    setError(null);
    invalidate();
  };
  // Everything except the secret (which is keep-on-blank when editing).
  const fields = () => ({
    type: form.type,
    displayName: form.displayName,
    issuer: form.issuer,
    clientId: form.clientId,
    scopes: splitCsv(form.scopes),
    allowedDomains: splitCsv(form.allowedDomains),
    defaultRole: form.defaultRole,
    enabled: form.enabled,
    requireVerifiedEmail: form.requireVerifiedEmail,
  });

  const create = useMutation({
    mutationFn: () => api.createOAuthProvider({ ...fields(), clientSecret: form.clientSecret }),
    onSuccess: reset,
    onError: (e: unknown) => fail(e, 'sso.addError'),
  });

  const update = useMutation({
    mutationFn: () =>
      api.updateOAuthProvider(editingId as string, {
        ...fields(),
        // Only rotate the secret when a new one is typed; blank keeps the stored one.
        ...(form.clientSecret ? { clientSecret: form.clientSecret } : {}),
      }),
    onSuccess: reset,
    onError: (e: unknown) => fail(e, 'sso.updateError'),
  });

  const toggle = useMutation({
    mutationFn: (vars: { id: string; enabled: boolean }) =>
      api.updateOAuthProvider(vars.id, { enabled: vars.enabled }),
    onSuccess: invalidate,
    onError: (e: unknown) => fail(e, 'sso.updateError'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteOAuthProvider(id),
    onSuccess: invalidate,
    onError: (e: unknown) => fail(e, 'sso.deleteError'),
  });

  const startEdit = (p: OAuthProvider) => {
    setEditingId(p.id);
    setForm({
      type: p.type,
      displayName: p.displayName,
      issuer: p.issuer,
      clientId: p.clientId,
      clientSecret: '',
      scopes: p.scopes.join(', '),
      allowedDomains: p.allowedDomains.join(', '),
      defaultRole: p.defaultRole,
      enabled: p.enabled,
      requireVerifiedEmail: p.requireVerifiedEmail,
    });
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    (editingId ? update : create).mutate();
  };

  const providers = providersQuery.data ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-50">{t('sso.title')}</h1>
        <p className="text-sm text-slate-400">{t('sso.subtitle')}</p>
      </header>

      <Card>
        <h2 className="mb-4 text-lg font-medium text-slate-100">
          {editingId ? t('sso.editProvider') : t('sso.addProvider')}
        </h2>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t('sso.type')}>
            <Select
              value={form.type}
              onChange={(e) => {
                const type = e.target.value as OAuthProviderType;
                setForm({ ...form, type, issuer: ISSUER_PRESETS[type] || form.issuer });
              }}
            >
              {TYPES.map((ty) => (
                <option key={ty} value={ty}>
                  {t(`sso.type.${ty}` as TranslationKey)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('sso.displayName')}>
            <Input
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              placeholder="Acme Google"
              required
            />
          </Field>
          <Field label={t('sso.issuer')}>
            <Input
              value={form.issuer}
              onChange={(e) => setForm({ ...form, issuer: e.target.value })}
              placeholder="https://accounts.google.com"
              required
            />
          </Field>
          <Field label={t('sso.clientId')}>
            <Input
              value={form.clientId}
              onChange={(e) => setForm({ ...form, clientId: e.target.value })}
              required
            />
          </Field>
          <Field label={t('sso.clientSecret')}>
            <Input
              type="password"
              value={form.clientSecret}
              onChange={(e) => setForm({ ...form, clientSecret: e.target.value })}
              autoComplete="off"
              placeholder={editingId ? t('providers.apiKeyKeep') : undefined}
              required={!editingId}
            />
          </Field>
          <Field label={t('sso.scopes')}>
            <Input
              value={form.scopes}
              onChange={(e) => setForm({ ...form, scopes: e.target.value })}
            />
          </Field>
          <Field label={t('sso.allowedDomains')}>
            <Input
              value={form.allowedDomains}
              onChange={(e) => setForm({ ...form, allowedDomains: e.target.value })}
              placeholder="acme.com"
            />
          </Field>
          <Field label={t('sso.defaultRole')}>
            <Select
              value={form.defaultRole}
              onChange={(e) => setForm({ ...form, defaultRole: e.target.value as Role })}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`role.${r}` as TranslationKey)}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center gap-3 self-end text-sm text-slate-200">
            <input
              type="checkbox"
              checked={form.requireVerifiedEmail}
              onChange={(e) => setForm({ ...form, requireVerifiedEmail: e.target.checked })}
              className="h-4 w-4 accent-concert-500"
            />
            <span>
              {t('sso.requireVerifiedEmail')}
              <span className="block text-xs text-slate-500">{t('sso.requireVerifiedEmailHint')}</span>
            </span>
          </label>
          <div className="flex items-end gap-2">
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {editingId
                ? update.isPending
                  ? t('providers.saving')
                  : t('providers.save')
                : create.isPending
                  ? t('sso.addingButton')
                  : t('sso.addButton')}
            </Button>
            {editingId ? (
              <Button type="button" variant="ghost" onClick={reset}>
                {t('providers.cancel')}
              </Button>
            ) : null}
          </div>
        </form>
        <p className="mt-3 text-xs text-slate-500">{t('sso.redirectHint')}</p>
        {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}
      </Card>

      {providersQuery.isLoading ? (
        <Spinner label={t('sso.loading')} />
      ) : providers.length === 0 ? (
        <EmptyState title={t('sso.noProviders')} hint={t('sso.noProvidersHint')} />
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/80 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('sso.colProvider')}</th>
                <th className="px-4 py-3">{t('sso.colCallback')}</th>
                <th className="px-4 py-3">{t('sso.colStatus')}</th>
                <th className="px-4 py-3 text-right">{t('sso.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {providers.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-100">{p.displayName}</div>
                    <div className="text-xs text-slate-500">
                      {t(`sso.type.${p.type}` as TranslationKey)} ·{' '}
                      {t(`role.${p.defaultRole}` as TranslationKey)}
                      {p.allowedDomains.length ? ` · ${p.allowedDomains.join(', ')}` : ''}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">
                    {`${window.location.origin}/admin/auth/oauth/${p.id}/callback`}
                  </td>
                  <td className="px-4 py-3">
                    {p.enabled ? (
                      <span className="text-emerald-400">{t('sso.enabledLabel')}</span>
                    ) : (
                      <span className="text-slate-500">{t('sso.disabledLabel')}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" onClick={() => startEdit(p)}>
                        {t('providers.edit')}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => toggle.mutate({ id: p.id, enabled: !p.enabled })}
                      >
                        {p.enabled ? t('sso.disable') : t('sso.enable')}
                      </Button>
                      <Button variant="danger" onClick={() => remove.mutate(p.id)}>
                        {t('sso.delete')}
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
