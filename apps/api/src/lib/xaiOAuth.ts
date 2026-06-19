import type { OAuthTokens } from '../providers/types';

/**
 * xAI OAuth 2.0 **Device Authorization Grant** client (RFC 8628). Lets a
 * self-hosted/headless deployment log a user in with their SuperGrok / X Premium
 * subscription without a redirect URI: we show a short code + URL, the user
 * approves on x.ai, and we poll for tokens. The resulting access token is a
 * bearer usable against the same `https://api.x.ai/v1` OpenAI-compatible API.
 *
 * This reuses xAI's public **grok-cli** OAuth client — the same mechanism the
 * official Grok CLI uses. It is unofficial for third-party apps, may be subject
 * to xAI's ToS, and can change without notice. Everything is overridable by env.
 */

export const XAI_ISSUER = process.env.XAI_OAUTH_ISSUER || 'https://auth.x.ai';
export const XAI_CLIENT_ID =
  process.env.XAI_OAUTH_CLIENT_ID || 'b1a00492-073a-47ea-816f-4c329264a828';
export const XAI_SCOPE =
  process.env.XAI_OAUTH_SCOPE || 'openid profile email offline_access grok-cli:access api:access';

const DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
const NETWORK_TIMEOUT_MS = 8000;
const DISCOVERY_TTL_MS = 60 * 60 * 1000;

export interface XaiOidc {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  deviceAuthorizationEndpoint: string;
  userinfoEndpoint: string;
}

export interface DeviceCodeResult {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string | null;
  expiresIn: number;
  interval: number;
}

export type PollResult =
  | { status: 'ok'; tokens: OAuthTokens }
  | { status: 'pending' }
  | { status: 'slow_down' }
  | { status: 'denied' }
  | { status: 'expired' }
  | { status: 'error'; message: string };

async function postForm(
  url: string,
  params: Record<string, string>,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), NETWORK_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams(params).toString(),
      signal: ac.signal,
    });
    let json: Record<string, unknown> = {};
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      /* non-JSON body */
    }
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

const discoveryCache = new Map<string, { cfg: XaiOidc; expires: number }>();

/** Resolve and cache the issuer's OIDC discovery document. */
export async function discoverXai(issuer: string = XAI_ISSUER): Promise<XaiOidc> {
  const base = issuer.replace(/\/+$/, '');
  const cached = discoveryCache.get(base);
  if (cached && cached.expires > Date.now()) return cached.cfg;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), NETWORK_TIMEOUT_MS);
  let doc: Record<string, unknown>;
  try {
    const res = await fetch(`${base}/.well-known/openid-configuration`, { signal: ac.signal });
    if (!res.ok) throw new Error(`discovery HTTP ${res.status}`);
    doc = (await res.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
  const cfg: XaiOidc = {
    authorizationEndpoint: String(doc.authorization_endpoint ?? ''),
    tokenEndpoint: String(doc.token_endpoint ?? ''),
    deviceAuthorizationEndpoint: String(doc.device_authorization_endpoint ?? ''),
    userinfoEndpoint: String(doc.userinfo_endpoint ?? ''),
  };
  if (!cfg.tokenEndpoint || !cfg.deviceAuthorizationEndpoint) {
    throw new Error('xAI discovery is missing the device/token endpoints.');
  }
  discoveryCache.set(base, { cfg, expires: Date.now() + DISCOVERY_TTL_MS });
  return cfg;
}

function toTokens(json: Record<string, unknown>, fallbackRefresh?: string): OAuthTokens {
  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : undefined;
  return {
    accessToken: String(json.access_token),
    refreshToken: (json.refresh_token as string | undefined) ?? fallbackRefresh,
    expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
    scope: json.scope as string | undefined,
    tokenType: json.token_type as string | undefined,
  };
}

/** Begin the device flow: returns a user code + verification URL to show. */
export async function startDeviceFlow(
  disc: XaiOidc,
  opts: { clientId?: string; scope?: string } = {},
): Promise<DeviceCodeResult> {
  const { status, json } = await postForm(disc.deviceAuthorizationEndpoint, {
    client_id: opts.clientId ?? XAI_CLIENT_ID,
    scope: opts.scope ?? XAI_SCOPE,
  });
  if (status >= 400 || typeof json.device_code !== 'string') {
    throw new Error(`Device code request failed (HTTP ${status}): ${json.error ?? 'unknown'}`);
  }
  return {
    deviceCode: json.device_code,
    userCode: String(json.user_code ?? ''),
    verificationUri: String(json.verification_uri ?? json.verification_url ?? ''),
    verificationUriComplete:
      (json.verification_uri_complete as string | undefined) ??
      (json.verification_url_complete as string | undefined) ??
      null,
    expiresIn: typeof json.expires_in === 'number' ? json.expires_in : 600,
    interval: typeof json.interval === 'number' ? json.interval : 5,
  };
}

/** Poll the token endpoint once for a pending device authorization. */
export async function pollDeviceToken(
  disc: XaiOidc,
  deviceCode: string,
  opts: { clientId?: string } = {},
): Promise<PollResult> {
  const { status, json } = await postForm(disc.tokenEndpoint, {
    grant_type: DEVICE_CODE_GRANT,
    client_id: opts.clientId ?? XAI_CLIENT_ID,
    device_code: deviceCode,
  });
  if (status >= 200 && status < 300 && typeof json.access_token === 'string') {
    return { status: 'ok', tokens: toTokens(json) };
  }
  switch (json.error) {
    case 'authorization_pending':
      return { status: 'pending' };
    case 'slow_down':
      return { status: 'slow_down' };
    case 'access_denied':
      return { status: 'denied' };
    case 'expired_token':
      return { status: 'expired' };
    default:
      return { status: 'error', message: String(json.error ?? `HTTP ${status}`) };
  }
}

/** Exchange a refresh token for a fresh access token (keeps the old refresh token if none returned). */
export async function refreshAccessToken(
  disc: XaiOidc,
  refreshToken: string,
  opts: { clientId?: string } = {},
): Promise<OAuthTokens> {
  const { status, json } = await postForm(disc.tokenEndpoint, {
    grant_type: 'refresh_token',
    client_id: opts.clientId ?? XAI_CLIENT_ID,
    refresh_token: refreshToken,
  });
  if (status >= 300 || typeof json.access_token !== 'string') {
    throw new Error(`Token refresh failed (HTTP ${status}): ${json.error ?? 'unknown'}`);
  }
  return toTokens(json, refreshToken);
}

/** Best-effort account label (email / name / sub) from the userinfo endpoint. */
export async function fetchUserinfo(disc: XaiOidc, accessToken: string): Promise<string | null> {
  if (!disc.userinfoEndpoint) return null;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), NETWORK_TIMEOUT_MS);
  try {
    const res = await fetch(disc.userinfoEndpoint, {
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
      signal: ac.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown>;
    return (
      (json.email as string | undefined) ??
      (json.name as string | undefined) ??
      (json.preferred_username as string | undefined) ??
      (json.sub as string | undefined) ??
      null
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
