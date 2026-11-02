import { describe, expect, it, vi } from 'vitest';
import { buildAuthMail, mailerConfig, mailerStatus, sendAuthMail } from '../src/lib/auth/mailer';
import { createAuthEmailLink } from '../src/lib/auth/email-links';

const ENV = {
  RESEND_API_KEY: 're_test_key_1234567890',
  SITEPILOT_MAIL_FROM: 'KPH SitePilot <no-reply@kph.example>',
};

function okFetch(id = 'mail_1') {
  return vi.fn(async () => new Response(JSON.stringify({ id }), { status: 200 }));
}

describe('mailerConfig', () => {
  it('is null when either half is missing', () => {
    expect(mailerConfig({})).toBeNull();
    expect(mailerConfig({ RESEND_API_KEY: ENV.RESEND_API_KEY })).toBeNull();
    expect(mailerConfig({ SITEPILOT_MAIL_FROM: ENV.SITEPILOT_MAIL_FROM })).toBeNull();
  });

  it('rejects a key that is not a Resend key', () => {
    expect(mailerConfig({ ...ENV, RESEND_API_KEY: 'sk_live_1234567890' })).toBeNull();
    expect(mailerConfig({ ...ENV, RESEND_API_KEY: 're_short' })).toBeNull();
  });

  it('rejects a sender that is not an address', () => {
    expect(mailerConfig({ ...ENV, SITEPILOT_MAIL_FROM: 'no-reply' })).toBeNull();
    expect(mailerConfig({ ...ENV, SITEPILOT_MAIL_FROM: '' })).toBeNull();
  });

  it('accepts both bare and display-name senders, and an optional reply-to', () => {
    expect(mailerConfig({ ...ENV, SITEPILOT_MAIL_FROM: 'no-reply@kph.example' })?.from).toBe(
      'no-reply@kph.example'
    );
    const withReplyTo = mailerConfig({ ...ENV, SITEPILOT_MAIL_REPLY_TO: 'help@kph.example' });
    expect(withReplyTo?.replyTo).toBe('help@kph.example');
    // A malformed reply-to is dropped rather than sent to the provider.
    expect(mailerConfig({ ...ENV, SITEPILOT_MAIL_REPLY_TO: 'nope' })?.replyTo).toBeNull();
  });
});

describe('mailerStatus', () => {
  it('reports configuration without ever exposing the key', () => {
    const status = mailerStatus(ENV);
    expect(status).toEqual({
      configured: true,
      provider: 'resend',
      from: 'KPH SitePilot <no-reply@kph.example>',
    });
    expect(JSON.stringify(status)).not.toContain('re_test_key');
    expect(mailerStatus({}).configured).toBe(false);
  });
});

describe('buildAuthMail', () => {
  it('links the URL in both parts and keeps the query separator intact', () => {
    const url = 'https://kph.example/auth/confirm?token_hash=abc&type=magiclink&next=%2F';
    const mail = buildAuthMail('confirmation', url);

    expect(mail.subject).toBe('Confirm your KPH SitePilot email address');
    expect(mail.text).toContain(url);
    // The href must keep a real `&`; only the visible text is escaped.
    expect(mail.html).toContain(`href="${url.replace(/&/g, '&amp;')}"`.replace(/&amp;amp;/g, '&amp;'));
  });

  it('uses recovery copy for a reset link', () => {
    const mail = buildAuthMail('recovery', 'https://kph.example/auth/confirm?token_hash=abc');
    expect(mail.subject).toMatch(/reset/i);
    expect(mail.text).toMatch(/password/i);
    expect(mail.text).not.toMatch(/create an account/);
  });

  it('escapes markup so a crafted URL cannot inject HTML', () => {
    const mail = buildAuthMail('confirmation', 'https://kph.example/?next="><script>alert(1)</script>');
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });
});

describe('sendAuthMail', () => {
  it('posts the message to Resend and returns the id', async () => {
    const fetchImpl = okFetch('mail_42');
    const result = await sendAuthMail({
      to: 'User@Example.com ',
      kind: 'confirmation',
      url: 'https://kph.example/auth/confirm?token_hash=abc',
      env: ENV,
      fetchImpl,
    });

    expect(result).toEqual({ ok: true, id: 'mail_42' });
    const [endpoint, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(endpoint).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${ENV.RESEND_API_KEY}`);

    const body = JSON.parse(String(init.body)) as { to: string[]; from: string; subject: string };
    expect(body.to).toEqual(['user@example.com']);
    expect(body.from).toBe(ENV.SITEPILOT_MAIL_FROM);
    expect(body.subject).toContain('Confirm');
  });

  it('does nothing at all when no mailer is configured', async () => {
    const fetchImpl = okFetch();
    const result = await sendAuthMail({
      to: 'user@example.com',
      kind: 'confirmation',
      url: 'https://kph.example/auth/confirm?token_hash=abc',
      env: {},
      fetchImpl,
    });
    expect(result).toEqual({ ok: false, reason: 'not-configured', status: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses an address that is not an address before calling the provider', async () => {
    const fetchImpl = okFetch();
    const result = await sendAuthMail({
      to: 'not-an-email',
      kind: 'recovery',
      url: 'https://kph.example/auth/confirm?token_hash=abc',
      env: ENV,
      fetchImpl,
    });
    expect(result).toEqual({ ok: false, reason: 'invalid-input', status: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('separates a provider rejection from an unreachable provider', async () => {
    const rejected = await sendAuthMail({
      to: 'user@example.com',
      kind: 'confirmation',
      url: 'https://kph.example/x',
      env: ENV,
      fetchImpl: vi.fn(async () => new Response('{"message":"domain not verified"}', { status: 403 })),
    });
    expect(rejected).toEqual({ ok: false, reason: 'rejected', status: 403 });

    const unreachable = await sendAuthMail({
      to: 'user@example.com',
      kind: 'confirmation',
      url: 'https://kph.example/x',
      env: ENV,
      fetchImpl: vi.fn(async () => {
        throw new Error('ENOTFOUND');
      }),
    });
    expect(unreachable).toEqual({ ok: false, reason: 'unreachable', status: null });
  });

  it('treats a 2xx with no JSON body as a success', async () => {
    const result = await sendAuthMail({
      to: 'user@example.com',
      kind: 'recovery',
      url: 'https://kph.example/x',
      env: ENV,
      fetchImpl: vi.fn(async () => new Response('', { status: 202 })),
    });
    expect(result).toEqual({ ok: true, id: null });
  });
});

describe('createAuthEmailLink', () => {
  function admin(result: {
    data?: { properties?: { hashed_token?: string | null } | null } | null;
    error?: { message?: string } | null;
    throws?: boolean;
  }) {
    const generateLink = vi.fn(async () => {
      if (result.throws) throw new Error('boom');
      return { data: result.data ?? null, error: result.error ?? null };
    });
    return { client: { auth: { admin: { generateLink } } }, generateLink };
  }

  it('builds a magic-link confirmation URL against our own origin', async () => {
    const { client, generateLink } = admin({ data: { properties: { hashed_token: 'hash_123' } } });
    const result = await createAuthEmailLink({
      kind: 'confirmation',
      email: 'user@example.com',
      siteOrigin: 'https://kph.example/',
      next: '/app',
      admin: client as never,
    });

    expect(result).toEqual({
      ok: true,
      url: 'https://kph.example/auth/confirm?token_hash=hash_123&type=magiclink&next=%2Fapp',
    });
    expect(generateLink).toHaveBeenCalledWith({
      type: 'magiclink',
      email: 'user@example.com',
      options: { redirectTo: 'https://kph.example/auth/confirm?next=%2Fapp' },
    });
  });

  it('uses the recovery type and the reset page', async () => {
    const { client } = admin({ data: { properties: { hashed_token: 'h2' } } });
    const result = await createAuthEmailLink({
      kind: 'recovery',
      email: 'user@example.com',
      siteOrigin: 'https://kph.example',
      admin: client as never,
    });
    expect(result.ok && result.url).toContain('type=recovery&next=%2Freset-password');
  });

  it('refuses an off-site next path instead of redirecting there', async () => {
    const { client } = admin({ data: { properties: { hashed_token: 'h3' } } });
    const result = await createAuthEmailLink({
      kind: 'confirmation',
      email: 'user@example.com',
      siteOrigin: 'https://kph.example',
      next: '//evil.example/steal',
      admin: client as never,
    });
    expect(result.ok && result.url).toContain('next=%2F');
    expect(result.ok && result.url).not.toContain('evil');
  });

  it('returns a reason instead of throwing for every failure shape', async () => {
    const providerError = admin({ error: { message: 'User not found' } });
    expect(
      await createAuthEmailLink({
        kind: 'recovery',
        email: 'user@example.com',
        siteOrigin: 'https://kph.example',
        admin: providerError.client as never,
      })
    ).toEqual({ ok: false, reason: 'provider' });

    const noToken = admin({ data: { properties: {} } });
    expect(
      await createAuthEmailLink({
        kind: 'confirmation',
        email: 'user@example.com',
        siteOrigin: 'https://kph.example',
        admin: noToken.client as never,
      })
    ).toEqual({ ok: false, reason: 'no-token' });

    const thrown = admin({ throws: true });
    expect(
      await createAuthEmailLink({
        kind: 'confirmation',
        email: 'user@example.com',
        siteOrigin: 'https://kph.example',
        admin: thrown.client as never,
      })
    ).toEqual({ ok: false, reason: 'provider' });

    expect(
      await createAuthEmailLink({
        kind: 'confirmation',
        email: 'user@example.com',
        siteOrigin: 'https://kph.example',
        admin: null,
      })
    ).toEqual({ ok: false, reason: 'not-configured' });
  });
});
