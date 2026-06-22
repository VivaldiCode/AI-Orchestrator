import { describe, expect, it } from 'vitest';
import { oauthErrorPage } from '../src/routes/admin/oauth-error-page';

describe('oauthErrorPage', () => {
  it('renders the status, message, and a back-to-login link', () => {
    const html = oauthErrorPage({
      status: 403,
      message: 'Email not verified',
      loginUrl: 'https://app.test/login',
    });
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Email not verified');
    expect(html).toContain('href="https://app.test/login"');
    expect(html).toContain('403');
    expect(html).toContain('Access denied'); // 403 → friendly title
  });

  it('HTML-escapes the message (no script/markup injection)', () => {
    const html = oauthErrorPage({
      status: 400,
      message: '<img src=x onerror=alert(1)>',
      loginUrl: '/login',
    });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
