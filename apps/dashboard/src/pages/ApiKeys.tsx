import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiKeyCreated } from '@ai-orchestrator/shared';
import { api } from '../lib/api';
import { formatRelativeTime } from '../lib/format';
import { Button, Card, EmptyState, Field, Input, Spinner } from '../components/ui';

export function ApiKeysPage() {
  const qc = useQueryClient();
  const keysQuery = useQuery({ queryKey: ['api-keys'], queryFn: api.listApiKeys });
  const [name, setName] = useState('');
  const [created, setCreated] = useState<ApiKeyCreated | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['api-keys'] });

  const create = useMutation({
    mutationFn: () => api.createApiKey({ name, scopes: ['inference'] }),
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
        <h1 className="text-2xl font-semibold text-slate-50">API Keys</h1>
        <p className="text-sm text-slate-400">
          Issue keys for inference clients. Once any key exists, all inference calls require one.
        </p>
      </header>

      {created ? (
        <Card className="border-baton-500/40 bg-baton-500/5">
          <p className="text-sm font-medium text-baton-400">
            Copy your new key now — it won't be shown again.
          </p>
          <code className="mt-2 block break-all rounded bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100">
            {created.secret}
          </code>
          <button
            onClick={() => setCreated(null)}
            className="mt-2 text-xs text-slate-400 hover:underline"
          >
            Dismiss
          </button>
        </Card>
      ) : null}

      <Card>
        <form onSubmit={submit} className="flex items-end gap-3">
          <div className="flex-1">
            <Field label="Key name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="laptop-cli"
                required
              />
            </Field>
          </div>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create key'}
          </Button>
        </form>
      </Card>

      {keysQuery.isLoading ? (
        <Spinner label="Loading keys…" />
      ) : (keysQuery.data ?? []).length === 0 ? (
        <EmptyState title="No API keys" hint="Inference is open until you create the first key." />
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/80 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Prefix</th>
                <th className="px-4 py-3">Last used</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {(keysQuery.data ?? []).map((k) => (
                <tr key={k.id}>
                  <td className="px-4 py-3 text-slate-100">{k.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{k.prefix}…</td>
                  <td className="px-4 py-3 text-slate-500">{formatRelativeTime(k.lastUsedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="danger" onClick={() => remove.mutate(k.id)}>
                      Revoke
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
