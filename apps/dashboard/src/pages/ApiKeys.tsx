import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiKeyCreated } from '@ai-orchestrator/shared';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import type { ApiKeyScope } from '@ai-orchestrator/shared';
import { Button, Card, EmptyState, Field, Input, Select, Spinner } from '../components/ui';

export function ApiKeysPage() {
  const { t, fmt } = useI18n();
  const qc = useQueryClient();
  const keysQuery = useQuery({ queryKey: ['api-keys'], queryFn: api.listApiKeys });
  const [name, setName] = useState('');
  const [scope, setScope] = useState<ApiKeyScope>('inference');
  const [created, setCreated] = useState<ApiKeyCreated | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['api-keys'] });

  const create = useMutation({
    mutationFn: () =>
      api.createApiKey({ name, scopes: scope === 'admin' ? ['admin'] : ['inference'] }),
    onSuccess: (key) => {
      setCreated(key);
      setName('');
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteApiKey(id),
    onSuccess: invalidate,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-50">{t('apiKeys.title')}</h1>
        <p className="text-sm text-slate-400">{t('apiKeys.subtitle')}</p>
      </header>

      {created ? (
        <Card className="border-baton-500/40 bg-baton-500/5">
          <p className="text-sm font-medium text-baton-400">{t('apiKeys.copyWarning')}</p>
          <code className="mt-2 block break-all rounded bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100">
            {created.secret}
          </code>
          <button
            onClick={() => setCreated(null)}
            className="mt-2 text-xs text-slate-400 hover:underline"
          >
            {t('apiKeys.dismiss')}
          </button>
        </Card>
      ) : null}

      <Card>
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <div className="flex-1">
            <Field label={t('apiKeys.keyName')}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('apiKeys.keyNamePlaceholder')}
                required
              />
            </Field>
          </div>
          <div className="w-44">
            <Field label={t('apiKeys.scope')}>
              <Select value={scope} onChange={(e) => setScope(e.target.value as ApiKeyScope)}>
                <option value="inference">{t('apiKeys.scopeInference')}</option>
                <option value="admin">{t('apiKeys.scopeAdmin')}</option>
              </Select>
            </Field>
          </div>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? t('apiKeys.creatingButton') : t('apiKeys.createButton')}
          </Button>
        </form>
        {scope === 'admin' ? (
          <p className="mt-3 text-xs text-baton-400">{t('apiKeys.adminHint')}</p>
        ) : null}
      </Card>

      {keysQuery.isLoading ? (
        <Spinner label={t('apiKeys.loading')} />
      ) : (keysQuery.data ?? []).length === 0 ? (
        <EmptyState title={t('apiKeys.noKeys')} hint={t('apiKeys.noKeysHint')} />
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/80 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('apiKeys.colName')}</th>
                <th className="px-4 py-3">{t('apiKeys.colScope')}</th>
                <th className="px-4 py-3">{t('apiKeys.colPrefix')}</th>
                <th className="px-4 py-3">{t('apiKeys.colLastUsed')}</th>
                <th className="px-4 py-3 text-right">{t('apiKeys.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {(keysQuery.data ?? []).map((k) => (
                <tr key={k.id}>
                  <td className="px-4 py-3 text-slate-100">{k.name}</td>
                  <td className="px-4 py-3">
                    {(k.scopes ?? []).includes('admin') ? (
                      <span className="rounded-full bg-baton-500/15 px-2 py-0.5 text-xs text-baton-400">
                        admin
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">inference</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{k.prefix}…</td>
                  <td className="px-4 py-3 text-slate-500">
                    {k.lastUsedAt ? fmt.relativeTime(k.lastUsedAt) : t('common.never')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="danger" onClick={() => remove.mutate(k.id)}>
                      {t('apiKeys.revoke')}
                    </Button>
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
