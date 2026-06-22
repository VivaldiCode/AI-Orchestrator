import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { decryptSecret, encryptSecret } from './crypto';

/**
 * Minimal, dependency-light OIDC client. The crypto-critical step — verifying
 * the provider's `id_token` — is delegated to the audited `jose` library
 * (JWKS fetch + rotation, signature, `iss`/`aud`/`exp` checks, and a strict
 * algorithm allowlist that blocks algorithm-confusion attacks). Everything else
 * (discovery, PKCE, the authorization-code exchange, and the sealed state we
 * round-trip through the IdP) uses only `node:crypto` and `fetch`.
 */

const DISCOVERY_TTL_MS = 60 * 60 * 1000; // 1h
const NETWORK_TIMEOUT_MS = 5000;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), NETWORK_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ac.signal });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} from ${url}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// --- Discovery -------------------------------------------------------------

export interface OidcConfig {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  userinfoEndpoint?: string | null;
}

const discoveryCache = new Map<string, { cfg: OidcConfig; expires: number }>();

/** Resolve and cache an issuer's `/.well-known/openid-configuration`. */
export async function discover(issuer: string): Promise<OidcConfig> {
  const base = issuer.replace(/\/+$/, '');
  const cached = discoveryCache.get(base);
  if (cached && cached.expires > Date.now()) return cached.cfg;

  const doc = await fetchJson<Record<string, unknown>>(`${base}/.well-known/openid-configuration`);
  const cfg: OidcConfig = {
    issuer: String(doc.issuer ?? base),
    authorizationEndpoint: String(doc.authorization_endpoint ?? ''),
    tokenEndpoint: String(doc.token_endpoint ?? ''),
    jwksUri: String(doc.jwks_uri ?? ''),
    userinfoEndpoint: typeof doc.userinfo_endpoint === 'string' ? doc.userinfo_endpoint : null,
  };
  if (!cfg.authorizationEndpoint || !cfg.tokenEndpoint || !cfg.jwksUri) {
    throw new Error('Incomplete OIDC discovery document');
  }
  discoveryCache.set(base, { cfg, expires: Date.now() + DISCOVERY_TTL_MS });
  return cfg;
}

// --- JWKS / id_token verification (via jose) -------------------------------

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(jwksUri: string): ReturnType<typeof createRemoteJWKSet> {
  let set = jwksCache.get(jwksUri);
  if (!set) {
    set = createRemoteJWKSet(new URL(jwksUri));
    jwksCache.set(jwksUri, set);
  }
  return set;
}

export interface IdTokenClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
  hd?: string;
  [key: string]: unknown;
}

/**
 * Verify an `id_token`: signature against the issuer's JWKS, `iss`/`aud`/`exp`,
 * a strict asymmetric-algorithm allowlist, and the `nonce` we issued.
 */
export async function verifyIdToken(
  idToken: string,
  opts: { jwksUri: string; issuer: string; audience: string; nonce?: string },
): Promise<IdTokenClaims> {
  const { payload } = await jwtVerify(idToken, getJwks(opts.jwksUri), {
    issuer: opts.issuer,
    audience: opts.audience,
    algorithms: ['RS256', 'PS256', 'ES256'],
  });
  if (opts.nonce && payload.nonce !== opts.nonce) throw new Error('OIDC nonce mismatch');
  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw new Error('OIDC id_token missing sub');
  }
  return payload as IdTokenClaims;
}

// --- PKCE + random tokens --------------------------------------------------

export interface PkcePair {
  verifier: string;
  challenge: string;
}

/** Generate a PKCE verifier and its S256 challenge (RFC 7636). */
export function generatePkce(): PkcePair {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

/** A URL-safe random token (for `state`, `nonce`, handoff codes). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

// --- Authorization URL + code exchange -------------------------------------

export function buildAuthUrl(
  cfg: OidcConfig,
  params: {
    clientId: string;
    redirectUri: string;
    scopes: string[];
    state: string;
    nonce: string;
    challenge: string;
  },
): string {
  const u = new URL(cfg.authorizationEndpoint);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', params.clientId);
  u.searchParams.set('redirect_uri', params.redirectUri);
  u.searchParams.set('scope', params.scopes.join(' '));
  u.searchParams.set('state', params.state);
  u.searchParams.set('nonce', params.nonce);
  u.searchParams.set('code_challenge', params.challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  return u.toString();
}

export interface TokenResponse {
  id_token?: string;
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

/** Exchange an authorization code for tokens (confidential client, PKCE). */
export async function exchangeCode(
  cfg: OidcConfig,
  params: {
    code: string;
    redirectUri: string;
    clientId: string;
    clientSecret: string;
    verifier: string;
  },
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code_verifier: params.verifier,
  });
  return fetchJson<TokenResponse>(cfg.tokenEndpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: body.toString(),
  });
}

/**
 * Fetch the OIDC `/userinfo` endpoint with the access token. Used to obtain
 * claims (notably `email`/`email_verified`) that some providers (e.g. Pocket-ID)
 * return only from userinfo, not in the id_token.
 */
export async function fetchUserinfo(
  userinfoEndpoint: string,
  accessToken: string,
): Promise<Record<string, unknown>> {
  return fetchJson<Record<string, unknown>>(userinfoEndpoint, {
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
  });
}

// --- Sealed handshake state (round-trips via an encrypted cookie) ----------

export interface OAuthState {
  providerId: string;
  state: string;
  verifier: string;
  nonce: string;
  returnTo: string;
}

/** Seal handshake state into an opaque AES-256-GCM token for the state cookie. */
export function sealState(data: OAuthState): string {
  return encryptSecret(JSON.stringify(data));
}

/** Open a sealed state token; returns null if tampered, malformed, or invalid. */
export function openState(value: string): OAuthState | null {
  try {
    const obj = JSON.parse(decryptSecret(value)) as OAuthState;
    if (obj?.providerId && obj.state && obj.verifier && obj.nonce) return obj;
    return null;
  } catch {
    return null;
  }
}
