import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createOAuthProviderSchema, updateOAuthProviderSchema } from '@ai-orchestrator/shared';
import { config } from '../../config/index';
import { AppError, badGateway, badRequest, notFound, unauthorized } from '../../lib/errors';
import { oauthErrorPage } from './oauth-error-page';
import {
  buildAuthUrl,
  discover,
  exchangeCode,
  fetchUserinfo,
  generatePkce,
  openState,
  randomToken,
  sealState,
  verifyIdToken,
} from '../../lib/oidc';
import { issueTokens } from './auth';
import { parseWith, pathId } from './util';

const COOKIE = 'aio_oauth';
const COOKIE_PATH = '/admin/auth/oauth';

function setCookie(value: string, maxAgeSec: number): string {
  const parts = [
    `${COOKIE}=${encodeURIComponent(value)}`,
    'HttpOnly',
    'SameSite=Lax',
    `Path=${COOKIE_PATH}`,
    `Max-Age=${maxAgeSec}`,
  ];
  if (config.publicBaseUrl.startsWith('https://')) parts.push('Secure');
  return parts.join('; ');
}

function clearCookie(): string {
  return `${COOKIE}=; HttpOnly; SameSite=Lax; Path=${COOKIE_PATH}; Max-Age=0`;
}

function readCookie(req: FastifyRequest): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === COOKIE) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

function redirectUriFor(providerId: string): string {
  return `${config.publicBaseUrl}/admin/auth/oauth/${providerId}/callback`;
}

/**
 * Render a browser-facing failure as a branded HTML page (not raw JSON). Keeps
 * the AppError's status + message; masks unexpected errors behind a generic note.
 */
function sendOAuthError(reply: FastifyReply, err: unknown): FastifyReply {
  const isApp = err instanceof AppError;
  const status = isApp ? err.statusCode : 500;
  const message = isApp
    ? err.message
    : 'An unexpected error occurred during sign-in. Please try again.';
  return reply
    .code(status)
    .type('text/html; charset=utf-8')
    .send(oauthErrorPage({ status, message, loginUrl: `${config.publicBaseUrl}/login` }));
}

/**
 * OAuth/OIDC single sign-on. Public endpoints drive the browser handshake
 * (Authorization Code + PKCE); admin endpoints manage provider config.
 */
export function registerOAuthRoutes(app: FastifyInstance): void {
  const admin = { preHandler: app.requireAdmin };
  // Stricter per-route limit on the public OAuth handshake (abuse defence).
  const strict = { config: { rateLimit: { max: 20, timeWindow: 60_000 } } };

  // --- public: login buttons + handshake -----------------------------------

  app.get('/auth/oauth/providers', async (_req, reply) => {
    return reply.send(await app.oauth.listPublicProviders());
  });

  app.get('/auth/oauth/:id/start', strict, async (req, reply) => {
    try {
      const provider = await app.oauth.getProviderRow(pathId(req.params));
      if (!provider || !provider.enabled) throw notFound('Unknown or disabled provider.');

      // Surface OIDC discovery failures (provider unreachable, wrong issuer URL,
      // timeout, TLS, incomplete document) instead of a generic 500.
      let cfg;
      try {
        cfg = await discover(provider.issuer);
      } catch (err) {
        throw badGateway(
          `SSO discovery failed for ${provider.issuer}/.well-known/openid-configuration — ${(err as Error).message}. Check the issuer URL and that the orchestrator can reach the provider.`,
        );
      }
      const pkce = generatePkce();
      const state = randomToken(24);
      const nonce = randomToken(24);
      const sealed = sealState({
        providerId: provider.id,
        state,
        verifier: pkce.verifier,
        nonce,
        returnTo: '/',
      });
      const url = buildAuthUrl(cfg, {
        clientId: provider.clientId,
        redirectUri: redirectUriFor(provider.id),
        scopes: provider.scopes?.length ? provider.scopes : ['openid', 'email', 'profile'],
        state,
        nonce,
        challenge: pkce.challenge,
      });
      reply.header('set-cookie', setCookie(sealed, 600));
      return reply.redirect(url);
    } catch (err) {
      return sendOAuthError(reply, err);
    }
  });

  app.get('/auth/oauth/:id/callback', strict, async (req, reply) => {
    try {
      const id = pathId(req.params);
      const q = req.query as Record<string, string | undefined>;
      const sealedRaw = readCookie(req);
      reply.header('set-cookie', clearCookie()); // state cookie is single-use

      if (q.error) throw badRequest(`Provider returned an error: ${q.error}`);
      if (!q.code || !q.state) throw badRequest('Missing authorization code or state.');
      const sealed = sealedRaw ? openState(sealedRaw) : null;
      if (!sealed) throw badRequest('Missing or invalid sign-in state. Please try again.');
      if (sealed.providerId !== id || sealed.state !== q.state)
        throw badRequest('Sign-in state mismatch.');

      const provider = await app.oauth.getProviderRow(id);
      if (!provider || !provider.enabled) throw notFound('Unknown or disabled provider.');

      let cfg;
      let tokenRes;
      try {
        cfg = await discover(provider.issuer);
        tokenRes = await exchangeCode(cfg, {
          code: q.code,
          redirectUri: redirectUriFor(provider.id),
          clientId: provider.clientId,
          clientSecret: app.oauth.clientSecret(provider),
          verifier: sealed.verifier,
        });
      } catch (err) {
        throw badGateway(`SSO token exchange failed: ${(err as Error).message}`);
      }
      if (!tokenRes.id_token) throw badRequest('Provider did not return an id_token.');

      let claims;
      try {
        claims = await verifyIdToken(tokenRes.id_token, {
          jwksUri: cfg.jwksUri,
          issuer: cfg.issuer,
          audience: provider.clientId,
          nonce: sealed.nonce,
        });
      } catch (err) {
        throw unauthorized(`SSO id_token verification failed: ${(err as Error).message}`);
      }

      // Some IdPs (e.g. Pocket-ID) return email/email_verified only from /userinfo,
      // not in the id_token. Fetch it when missing so the email-domain allowlist can
      // be enforced; the userinfo `sub` must match the id_token `sub` (OIDC §5.3.2).
      if (!claims.email && cfg.userinfoEndpoint && tokenRes.access_token) {
        try {
          const ui = await fetchUserinfo(cfg.userinfoEndpoint, tokenRes.access_token);
          if (ui.sub === claims.sub) {
            if (typeof ui.email === 'string') claims.email = ui.email;
            if (ui.email_verified !== undefined)
              claims.email_verified = ui.email_verified as boolean;
            if (!claims.name && typeof ui.name === 'string') claims.name = ui.name;
            if (!claims.preferred_username && typeof ui.preferred_username === 'string')
              claims.preferred_username = ui.preferred_username;
          }
        } catch {
          // userinfo is optional — if email is still missing, provisioning gives a clear error
        }
      }

      const userRow = await app.oauth.findOrProvisionUser(provider, claims);
      const tokens = issueTokens(app, app.auth.toUser(userRow));
      const code = app.oauth.createHandoff(tokens);

      const dest = new URL(`${config.publicBaseUrl}/`);
      dest.searchParams.set('oauth', code);
      return reply.redirect(dest.toString());
    } catch (err) {
      return sendOAuthError(reply, err);
    }
  });

  app.post('/auth/oauth/exchange', strict, async (req, reply) => {
    const body = req.body as { code?: unknown } | undefined;
    const code = typeof body?.code === 'string' ? body.code : '';
    if (!code) throw badRequest('Missing handoff code.');
    const tokens = app.oauth.consumeHandoff(code);
    if (!tokens) throw unauthorized('Invalid or expired sign-in code.');
    return reply.send(tokens);
  });

  // --- admin: provider configuration ---------------------------------------

  app.get('/auth/oauth', admin, async (_req, reply) => {
    return reply.send(await app.oauth.listProviders());
  });

  app.post('/auth/oauth', admin, async (req, reply) => {
    const input = parseWith(createOAuthProviderSchema, req.body);
    return reply.code(201).send(await app.oauth.createProvider(input));
  });

  app.patch('/auth/oauth/:id', admin, async (req, reply) => {
    const patch = parseWith(updateOAuthProviderSchema, req.body);
    return reply.send(await app.oauth.updateProvider(pathId(req.params), patch));
  });

  app.delete('/auth/oauth/:id', admin, async (req, reply) => {
    await app.oauth.deleteProvider(pathId(req.params));
    return reply.code(204).send();
  });
}
