import { Fragment, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { mcpTransportSchema, type McpServer, type McpTransport } from '@ai-orchestrator/shared';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import type { TranslationKey } from '../i18n/en';
import { Button, Card, cn, EmptyState, Field, Input, Select, Spinner } from '../components/ui';

const TRANSPORTS = mcpTransportSchema.options;

const EMPTY = {
  name: '',
  transport: 'http' as McpTransport,
  url: '',
  command: '',
  args: '',
  authToken: '',
};

export function McpPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const serversQuery = useQuery({ queryKey: ['mcp-servers'], queryFn: api.listMcpServers });
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['mcp-servers'] });
  const fail = (e: unknown, k: TranslationKey) => setError(e instanceof Error ? e.message : t(k));

  const create = useMutation({
    mutationFn: () =>
      api.createMcpServer({
        name: form.name,
        transport: form.transport,
        url: form.transport === 'http' ? form.url || null : null,
        command: form.transport === 'stdio' ? form.command || null : null,
        args: form.args ? form.args.split(/\s+/).filter(Boolean) : [],
        enabled: true,
        authToken: form.authToken || null,
      }),
    onSuccess: () => {
      setForm(EMPTY);
      setError(null);
      invalidate();
    },
    onError: (e: unknown) => fail(e, 'mcp.addError'),
  });

  const discover = useMutation({
    mutationFn: (id: string) => api.discoverMcpServer(id),
    onSuccess: invalidate,
    onError: (e: unknown) => fail(e, 'mcp.discoverError'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteMcpServer(id),
    onSuccess: invalidate,
    onError: (e: unknown) => fail(e, 'mcp.deleteError'),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  const servers = serversQuery.data ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-50">{t('mcp.title')}</h1>
        <p className="text-sm text-slate-400">{t('mcp.subtitle')}</p>
      </header>

      <Card>
        <h2 className="mb-4 text-lg font-medium text-slate-100">{t('mcp.addServer')}</h2>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t('mcp.name')}>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </Field>
          <Field label={t('mcp.transport')}>
            <Select
              value={form.transport}
              onChange={(e) => setForm({ ...form, transport: e.target.value as McpTransport })}
            >
              {TRANSPORTS.map((tr) => (
                <option key={tr} value={tr}>
                  {tr}
                </option>
              ))}
            </Select>
          </Field>
          {form.transport === 'http' ? (
            <>
              <Field label={t('mcp.url')}>
                <Input
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="http://mcp-host:3000/mcp"
                  required
                />
              </Field>
              <Field label={t('mcp.authToken')}>
                <Input
                  type="password"
                  value={form.authToken}
                  onChange={(e) => setForm({ ...form, authToken: e.target.value })}
                  autoComplete="off"
                />
              </Field>
            </>
          ) : (
            <>
              <Field label={t('mcp.command')}>
                <Input
                  value={form.command}
                  onChange={(e) => setForm({ ...form, command: e.target.value })}
                  placeholder="npx"
                  required
                />
              </Field>
              <Field label={t('mcp.args')}>
                <Input
                  value={form.args}
                  onChange={(e) => setForm({ ...form, args: e.target.value })}
                  placeholder="-y some-mcp-server"
                />
              </Field>
            </>
          )}
          <div className="flex items-end">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? t('mcp.addingButton') : t('mcp.addButton')}
            </Button>
          </div>
        </form>
        {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}
      </Card>

      {serversQuery.isLoading ? (
        <Spinner label={t('mcp.loading')} />
      ) : servers.length === 0 ? (
        <EmptyState title={t('mcp.noServers')} hint={t('mcp.noServersHint')} />
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/80 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('mcp.colServer')}</th>
                <th className="px-4 py-3">{t('mcp.colEndpoint')}</th>
                <th className="px-4 py-3">{t('mcp.colTools')}</th>
                <th className="px-4 py-3 text-right">{t('mcp.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {servers.map((s) => (
                <Fragment key={s.id}>
                  <tr>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-100">{s.name}</div>
                      {s.lastError ? (
                        <div className="text-xs text-rose-400">{s.lastError}</div>
                      ) : (
                        <div className="text-xs text-slate-500">{s.transport}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">
                      {s.transport === 'http' ? s.url : `${s.command} ${s.args.join(' ')}`}
                      {s.hasAuth ? ' 🔒' : ''}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {t('mcp.toolCount', {
                        allowed: s.tools.filter((tool) => tool.allowed).length,
                        total: s.tools.length,
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          onClick={() => discover.mutate(s.id)}
                          disabled={discover.isPending}
                        >
                          {t('mcp.discover')}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                        >
                          {t('mcp.tools')}
                        </Button>
                        <Button variant="danger" onClick={() => remove.mutate(s.id)}>
                          {t('mcp.delete')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {expanded === s.id ? (
                    <tr>
                      <td colSpan={4} className="p-0">
                        <ToolAllowlist server={s} onSaved={() => setExpanded(null)} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function ToolAllowlist({ server, onSaved }: { server: McpServer; onSaved: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [allowed, setAllowed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(server.tools.map((tool) => [tool.name, tool.allowed])),
  );

  const save = useMutation({
    mutationFn: () =>
      api.setMcpToolAllow(server.id, {
        tools: server.tools.map((tool) => ({ name: tool.name, allowed: !!allowed[tool.name] })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mcp-servers'] });
      onSaved();
    },
  });

  return (
    <div className="space-y-3 border-t border-slate-800 bg-slate-900/40 px-4 py-4">
      {server.tools.length === 0 ? (
        <p className="text-xs text-slate-500">{t('mcp.noTools')}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {server.tools.map((tool) => (
            <li key={tool.name}>
              <label
                className={cn(
                  'flex items-start gap-2 rounded-lg border px-3 py-2',
                  allowed[tool.name]
                    ? 'border-slate-700 bg-slate-950'
                    : 'border-slate-800 bg-slate-900/40 opacity-60',
                )}
              >
                <input
                  type="checkbox"
                  checked={!!allowed[tool.name]}
                  onChange={(e) => setAllowed({ ...allowed, [tool.name]: e.target.checked })}
                  className="mt-0.5 h-4 w-4 accent-concert-500"
                />
                <span className="min-w-0">
                  <span className="block truncate font-mono text-xs text-slate-200">
                    {tool.name}
                  </span>
                  {tool.description ? (
                    <span className="block truncate text-[10px] text-slate-500">
                      {tool.description}
                    </span>
                  ) : null}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <Button onClick={() => save.mutate()} disabled={save.isPending || server.tools.length === 0}>
        {save.isPending ? t('mcp.savingTools') : t('mcp.saveTools')}
      </Button>
    </div>
  );
}
