import type {
  AnalyticsQuery,
  AnalyticsSummary,
  ApiKey,
  ApiKeyCreated,
  ArchiveList,
  CreateApiKeyInput,
  CreateMcpServerInput,
  CreateNodeInput,
  CreateModelPriceInput,
  CreateOAuthProviderInput,
  CreateProviderInput,
  CreateSkillInput,
  CreateUserInput,
  DeviceLogin,
  DevicePoll,
  McpServer,
  PlaygroundOptions,
  PlaygroundRequest,
  PlaygroundResult,
  ModelPrice,
  NodeWithRuntime,
  OAuthProvider,
  Provider,
  ProviderBalance,
  PublicOAuthProvider,
  SetToolAllowInput,
  Settings,
  Skill,
  TokenPair,
  UpdateMcpServerInput,
  UpdateModelPriceInput,
  UpdateNodeInput,
  UpdateOAuthProviderInput,
  UpdateProviderInput,
  UpdateSettingsInput,
  UpdateSkillInput,
  UpdateUserInput,
  User,
} from '@ai-orchestrator/shared';

const TOKEN_KEY = 'aio.tokens';

export type Tokens = Pick<TokenPair, 'accessToken' | 'refreshToken' | 'expiresIn'>;

export function getTokens(): Tokens | null {
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Tokens;
  } catch {
    return null;
  }
}

export function setTokens(tokens: Tokens): void {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function toError(res: Response): Promise<ApiError> {
  let code = 'error';
  let message = res.statusText;
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    code = body.error ?? code;
    message = body.message ?? message;
  } catch {
    /* non-JSON error */
  }
  return new ApiError(res.status, code, message);
}

async function tryRefresh(refreshToken: string): Promise<Tokens | null> {
  try {
    const res = await fetch('/admin/auth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const tokens = (await res.json()) as Tokens;
    setTokens(tokens);
    return tokens;
  } catch {
    return null;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const tokens = getTokens();
  const headers: Record<string, string> = {};
  // Only declare a JSON body when one is actually sent — otherwise Fastify
  // rejects bodyless requests (e.g. DELETE) with FST_ERR_CTP_EMPTY_JSON_BODY.
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.auth !== false && tokens) headers.authorization = `Bearer ${tokens.accessToken}`;

  const init: RequestInit = {
    method: opts.method ?? 'GET',
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  };

  let res = await fetch(path, init);

  if (res.status === 401 && tokens?.refreshToken) {
    const refreshed = await tryRefresh(tokens.refreshToken);
    if (refreshed) {
      headers.authorization = `Bearer ${refreshed.accessToken}`;
      res = await fetch(path, init);
    } else {
      clearTokens();
    }
  }

  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** GET a plain-text endpoint (e.g. archived request/response bodies). */
async function requestText(path: string): Promise<string> {
  const tokens = getTokens();
  const headers: Record<string, string> = {};
  if (tokens) headers.authorization = `Bearer ${tokens.accessToken}`;
  let res = await fetch(path, { headers });
  if (res.status === 401 && tokens?.refreshToken) {
    const refreshed = await tryRefresh(tokens.refreshToken);
    if (refreshed) {
      headers.authorization = `Bearer ${refreshed.accessToken}`;
      res = await fetch(path, { headers });
    } else {
      clearTokens();
    }
  }
  if (!res.ok) throw await toError(res);
  return res.text();
}

// --- typed endpoints -------------------------------------------------------

export const api = {
  // auth
  setupStatus: () => request<{ needsSetup: boolean }>('/admin/auth/setup-status', { auth: false }),
  setup: (username: string, password: string) =>
    request<{ user: User; tokens: TokenPair }>('/admin/auth/setup', {
      method: 'POST',
      body: { username, password },
      auth: false,
    }),
  login: (username: string, password: string) =>
    request<TokenPair>('/admin/auth/login', {
      method: 'POST',
      body: { username, password },
      auth: false,
    }),
  me: () => request<User>('/admin/auth/me'),

  // nodes
  listNodes: () => request<NodeWithRuntime[]>('/admin/nodes'),
  createNode: (input: CreateNodeInput) =>
    request<NodeWithRuntime>('/admin/nodes', { method: 'POST', body: input }),
  updateNode: (id: string, input: UpdateNodeInput) =>
    request<NodeWithRuntime>(`/admin/nodes/${id}`, { method: 'PATCH', body: input }),
  deleteNode: (id: string) => request<void>(`/admin/nodes/${id}`, { method: 'DELETE' }),
  testNode: (id: string) =>
    request<{
      ok: boolean;
      latencyMs?: number;
      version?: string | null;
      models?: string[];
      error?: string;
    }>(`/admin/nodes/${id}/test`, { method: 'POST' }),

  // providers
  listProviders: () => request<Provider[]>('/admin/providers'),
  createProvider: (input: CreateProviderInput) =>
    request<Provider>('/admin/providers', { method: 'POST', body: input }),
  updateProvider: (id: string, input: UpdateProviderInput) =>
    request<Provider>(`/admin/providers/${id}`, { method: 'PATCH', body: input }),
  deleteProvider: (id: string) => request<void>(`/admin/providers/${id}`, { method: 'DELETE' }),
  getProviderBalance: (id: string) => request<ProviderBalance>(`/admin/providers/${id}/balance`),
  // archived prompts for one provider (newest first)
  listArchiveByProvider: (provider: string, limit = 100) =>
    request<ArchiveList>(`/admin/archive?provider=${encodeURIComponent(provider)}&limit=${limit}`),
  archiveBody: (date: string, id: string, kind: 'request' | 'response') =>
    requestText(`/admin/archive/${encodeURIComponent(date)}/${encodeURIComponent(id)}/${kind}`),
  // xAI subscription (OAuth device flow)
  startXaiDevice: (id: string) =>
    request<DeviceLogin>(`/admin/providers/${id}/xai/device/start`, { method: 'POST' }),
  pollXaiDevice: (id: string) =>
    request<DevicePoll>(`/admin/providers/${id}/xai/device/poll`, { method: 'POST' }),
  disconnectXai: (id: string) =>
    request<{ status: string }>(`/admin/providers/${id}/xai/disconnect`, { method: 'POST' }),
  // query playground
  playground: (input: PlaygroundRequest) =>
    request<PlaygroundResult>('/admin/playground', { method: 'POST', body: input }),
  playgroundOptions: () => request<PlaygroundOptions>('/admin/playground/options'),

  // model prices (cost tracking)
  listPrices: () => request<ModelPrice[]>('/admin/prices'),
  createPrice: (input: CreateModelPriceInput) =>
    request<ModelPrice>('/admin/prices', { method: 'POST', body: input }),
  updatePrice: (id: string, input: UpdateModelPriceInput) =>
    request<ModelPrice>(`/admin/prices/${id}`, { method: 'PATCH', body: input }),
  deletePrice: (id: string) => request<void>(`/admin/prices/${id}`, { method: 'DELETE' }),

  // settings
  getSettings: () => request<Settings>('/admin/settings'),
  updateSettings: (input: UpdateSettingsInput) =>
    request<Settings>('/admin/settings', { method: 'PUT', body: input }),

  // analytics
  analytics: (query: Partial<AnalyticsQuery> = {}) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v != null) params.set(k, String(v));
    const qs = params.toString();
    return request<AnalyticsSummary>(`/admin/analytics${qs ? `?${qs}` : ''}`);
  },

  // api keys
  listApiKeys: () => request<ApiKey[]>('/admin/api-keys'),
  createApiKey: (input: CreateApiKeyInput) =>
    request<ApiKeyCreated>('/admin/api-keys', { method: 'POST', body: input }),
  deleteApiKey: (id: string) => request<void>(`/admin/api-keys/${id}`, { method: 'DELETE' }),

  // users
  listUsers: () => request<User[]>('/admin/users'),
  createUser: (input: CreateUserInput) =>
    request<User>('/admin/users', { method: 'POST', body: input }),
  updateUser: (id: string, input: UpdateUserInput) =>
    request<User>(`/admin/users/${id}`, { method: 'PATCH', body: input }),
  deleteUser: (id: string) => request<void>(`/admin/users/${id}`, { method: 'DELETE' }),

  // oauth / sso
  listPublicOAuthProviders: () =>
    request<PublicOAuthProvider[]>('/admin/auth/oauth/providers', { auth: false }),
  oauthStartUrl: (id: string) => `/admin/auth/oauth/${id}/start`,
  oauthExchange: (code: string) =>
    request<TokenPair>('/admin/auth/oauth/exchange', {
      method: 'POST',
      body: { code },
      auth: false,
    }),
  listOAuthProviders: () => request<OAuthProvider[]>('/admin/auth/oauth'),
  createOAuthProvider: (input: CreateOAuthProviderInput) =>
    request<OAuthProvider>('/admin/auth/oauth', { method: 'POST', body: input }),
  updateOAuthProvider: (id: string, input: UpdateOAuthProviderInput) =>
    request<OAuthProvider>(`/admin/auth/oauth/${id}`, { method: 'PATCH', body: input }),
  deleteOAuthProvider: (id: string) =>
    request<void>(`/admin/auth/oauth/${id}`, { method: 'DELETE' }),

  // mcp servers
  listMcpServers: () => request<McpServer[]>('/admin/mcp/servers'),
  createMcpServer: (input: CreateMcpServerInput) =>
    request<McpServer>('/admin/mcp/servers', { method: 'POST', body: input }),
  updateMcpServer: (id: string, input: UpdateMcpServerInput) =>
    request<McpServer>(`/admin/mcp/servers/${id}`, { method: 'PATCH', body: input }),
  deleteMcpServer: (id: string) => request<void>(`/admin/mcp/servers/${id}`, { method: 'DELETE' }),
  discoverMcpServer: (id: string) =>
    request<McpServer>(`/admin/mcp/servers/${id}/discover`, { method: 'POST' }),
  setMcpToolAllow: (id: string, input: SetToolAllowInput) =>
    request<McpServer>(`/admin/mcp/servers/${id}/tools`, { method: 'PUT', body: input }),

  // skills
  listSkills: () => request<Skill[]>('/admin/skills'),
  createSkill: (input: CreateSkillInput) =>
    request<Skill>('/admin/skills', { method: 'POST', body: input }),
  updateSkill: (id: string, input: UpdateSkillInput) =>
    request<Skill>(`/admin/skills/${id}`, { method: 'PATCH', body: input }),
  deleteSkill: (id: string) => request<void>(`/admin/skills/${id}`, { method: 'DELETE' }),
};
