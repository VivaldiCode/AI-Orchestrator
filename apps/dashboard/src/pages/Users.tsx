import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { roleSchema, type Role } from '@ai-orchestrator/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../i18n';
import type { TranslationKey } from '../i18n/en';
import { Button, Card, EmptyState, Field, Input, Select, Spinner } from '../components/ui';

const ROLES = roleSchema.options;

const EMPTY: { username: string; password: string; role: Role } = {
  username: '',
  password: '',
  role: 'admin',
};

export function UsersPage() {
  const { t } = useI18n();
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const usersQuery = useQuery({ queryKey: ['users'], queryFn: api.listUsers });
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const canWrite = me?.permissions?.includes('users:write') ?? false;
  const invalidate = () => qc.invalidateQueries({ queryKey: ['users'] });
  const fail = (e: unknown, fallback: TranslationKey) =>
    setError(e instanceof Error ? e.message : t(fallback));

  const create = useMutation({
    mutationFn: () => api.createUser({ ...form, permissions: null }),
    onSuccess: () => {
      setForm(EMPTY);
      setError(null);
      invalidate();
    },
    onError: (e: unknown) => fail(e, 'users.addError'),
  });

  const changeRole = useMutation({
    mutationFn: (vars: { id: string; role: Role }) => api.updateUser(vars.id, { role: vars.role }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (e: unknown) => fail(e, 'users.updateError'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteUser(id),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (e: unknown) => fail(e, 'users.deleteError'),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  const users = usersQuery.data ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-50">{t('users.title')}</h1>
        <p className="text-sm text-slate-400">{t('users.subtitle')}</p>
      </header>

      {canWrite ? (
        <Card>
          <h2 className="mb-4 text-lg font-medium text-slate-100">{t('users.addUser')}</h2>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t('users.username')}>
              <Input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
            </Field>
            <Field label={t('users.password')}>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </Field>
            <Field label={t('users.role')}>
              <Select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
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
                {create.isPending ? t('users.addingButton') : t('users.addButton')}
              </Button>
            </div>
          </form>
          <p className="mt-2 text-xs text-slate-500">{t('auth.passwordHint')}</p>
          {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}
        </Card>
      ) : null}

      {usersQuery.isLoading ? (
        <Spinner label={t('users.loading')} />
      ) : users.length === 0 ? (
        <EmptyState title={t('users.noUsers')} hint={t('users.noUsersHint')} />
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/80 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('users.colUser')}</th>
                <th className="px-4 py-3">{t('users.colRole')}</th>
                <th className="px-4 py-3">{t('users.colPermissions')}</th>
                <th className="px-4 py-3">{t('users.colCreated')}</th>
                <th className="px-4 py-3 text-right">{t('users.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {users.map((u) => {
                const isSelf = u.id === me?.id;
                return (
                  <tr key={u.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-100">{u.username}</div>
                      {isSelf ? (
                        <div className="text-xs text-slate-500">{t('users.you')}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {canWrite ? (
                        <Select
                          value={u.role}
                          disabled={isSelf || changeRole.isPending}
                          onChange={(e) =>
                            changeRole.mutate({ id: u.id, role: e.target.value as Role })
                          }
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {t(`role.${r}` as TranslationKey)}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        t(`role.${u.role}` as TranslationKey)
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {t('users.permCount', { count: u.permissions.length })}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        {canWrite && !isSelf ? (
                          <Button variant="danger" onClick={() => remove.mutate(u.id)}>
                            {t('users.delete')}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
