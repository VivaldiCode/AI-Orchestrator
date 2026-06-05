import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  oauthProviderTypeSchema,
  roleSchema,
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
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['oauth-providers'] });
  const fail = (e: unknown, fallback: TranslationKey) =>
    setError(e instanceof Error ? e.message : t(fallback));

  const create = useMutation({
    mutationFn: () =>
      api.createOAuthProvider({
        type: form.type,
        displayName: form.displayName,
        issuer: form.issuer,
        clientId: form.clientId,
        clientSecret: form.clientSecret,
        scopes: splitCsv(form.scopes),
        allowedDomains: splitCsv(form.allowedDomains),
        defaultRole: form.defaultRole,
        enabled: form.enabled,
      }),
    onSuccess: () => {
      setForm(EMPTY);
      setError(null);
      invalidate();
    },
    onError: (e: unknown) => fail(e, 'sso.addError'),
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

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  const providers = providersQuery.data ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-50">{t('sso.title')}</h1>
        <p className="text-sm text-slate-400">{t('sso.subtitle')}</p>
      </header>

      <Card>
        <h2 className="mb-4 text-lg font-medium text-slate-100">{t('sso.addProvider')}</h2>
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
              required
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
          <div className="flex items-end">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? t('sso.addingButton') : t('sso.addButton')}
            </Button>
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
