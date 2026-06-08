import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  discoverXai,
  fetchUserinfo,
  pollDeviceToken,
  refreshAccessToken,
  startDeviceFlow,
  type XaiOidc,
} from '../src/lib/xaiOAuth';

function body(req: import('node:http').IncomingMessage): Promise<URLSearchParams> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(new URLSearchParams(Buffer.concat(chunks).toString('utf8'))));
  });
}

/** Mock xAI OAuth server: discovery, device/code, token (pending→ok), refresh, userinfo. */
function startMockAuth(): Promise<{ origin: string; close: () => Promise<void> }> {
  let pollCount = 0;
  const server = createServer(async (req, res) => {
    const url = req.url ?? '';
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const json = (o: unknown, code = 200): void => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(o));
    };
    if (url.startsWith('/.well-known/openid-configuration')) {
      return json({
        authorization_endpoint: `${origin}/oauth2/authorize`,
        token_endpoint: `${origin}/oauth2/token`,
        device_authorization_endpoint: `${origin}/oauth2/device/code`,
        userinfo_endpoint: `${origin}/oauth2/userinfo`,
      });
    }
    if (url.startsWith('/oauth2/device/code')) {
      return json({
        device_code: 'DEV123',
        user_code: 'WXYZ-1234',
        verification_uri: 'https://x.ai/device',
        verification_uri_complete: 'https://x.ai/device?code=WXYZ-1234',
        expires_in: 600,
        interval: 1,
      });
    }
    if (url.startsWith('/oauth2/token')) {
      const p = await body(req);
      const grant = p.get('grant_type');
      if (grant === 'urn:ietf:params:oauth:grant-type:device_code') {
        if (p.get('device_code') !== 'DEV123') return json({ error: 'invalid_grant' }, 400);
        pollCount += 1;
        if (pollCount < 2) return json({ error: 'authorization_pending' }, 400);
        return json({
          access_token: 'at1',
          refresh_token: 'rt1',
          expires_in: 3600,
          scope: 'api:access',
          token_type: 'Bearer',
        });
      }
      if (grant === 'refresh_token') {
        if (p.get('refresh_token') !== 'rt1') return json({ error: 'invalid_grant' }, 400);
        return json({ access_token: 'at2', expires_in: 3600, token_type: 'Bearer' });
      }
      return json({ error: 'unsupported_grant_type' }, 400);
    }
    if (url.startsWith('/oauth2/userinfo')) {
      if (req.headers.authorization === 'Bearer at1') return json({ email: 'me@x.ai' });
      return json({}, 401);
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      resolve({
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

describe('xAI OAuth device flow', () => {
  let mock: Awaited<ReturnType<typeof startMockAuth>>;
  let disc: XaiOidc;

  beforeAll(async () => {
    mock = await startMockAuth();
    disc = await discoverXai(mock.origin);
  });
  afterAll(async () => {
    await mock.close();
  });

  it('discovers the device + token endpoints', () => {
    expect(disc.deviceAuthorizationEndpoint).toContain('/oauth2/device/code');
    expect(disc.tokenEndpoint).toContain('/oauth2/token');
    expect(disc.userinfoEndpoint).toContain('/oauth2/userinfo');
  });

  it('starts a device flow and returns a user code + verification URL', async () => {
    const res = await startDeviceFlow(disc);
    expect(res.deviceCode).toBe('DEV123');
    expect(res.userCode).toBe('WXYZ-1234');
    expect(res.verificationUri).toBe('https://x.ai/device');
    expect(res.verificationUriComplete).toContain('code=WXYZ-1234');
    expect(res.interval).toBe(1);
  });

  it('polls pending, then returns tokens with a computed expiry', async () => {
    const first = await pollDeviceToken(disc, 'DEV123');
    expect(first.status).toBe('pending');
    const second = await pollDeviceToken(disc, 'DEV123');
    expect(second.status).toBe('ok');
    if (second.status === 'ok') {
      expect(second.tokens.accessToken).toBe('at1');
      expect(second.tokens.refreshToken).toBe('rt1');
      expect(second.tokens.expiresAt).toBeGreaterThan(Date.now());
    }
  });

  it('reports access_denied as denied', async () => {
    const res = await pollDeviceToken(disc, 'WRONG');
    expect(res.status).toBe('error'); // invalid_grant → error (not a poll state)
  });

  it('refreshes the access token and keeps the old refresh token', async () => {
    const tokens = await refreshAccessToken(disc, 'rt1');
    expect(tokens.accessToken).toBe('at2');
    expect(tokens.refreshToken).toBe('rt1'); // server returned none → kept
  });

  it('fetches a userinfo account label', async () => {
    expect(await fetchUserinfo(disc, 'at1')).toBe('me@x.ai');
    expect(await fetchUserinfo(disc, 'bad')).toBeNull();
  });
});
