/**
 * The email seam: the log provider stays the default, and the SendGrid provider
 * is exercised against a stub so the request shape is pinned without a key.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';

interface Captured {
  url: string;
  init: RequestInit;
}

function stubFetch(status: number): Captured[] {
  const calls: Captured[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(status === 202 ? '' : 'bad request', { status });
  });
  return calls;
}

beforeEach(() => {
  vi.resetModules();
  delete process.env.EMAIL_PROVIDER;
  delete process.env.SENDGRID_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('email provider selection', () => {
  it('defaults to the log provider, which never reaches the network', async () => {
    const calls = stubFetch(202);
    const { emailProvider } = await import('../src/services/email.js');
    const provider = emailProvider();
    expect(provider.name).toBe('log');
    await provider.send({ to: 'player@example.org', subject: 'Hi', text: 'Body' });
    expect(calls).toHaveLength(0);
  });

  it('posts the message to SendGrid with the key in the header only', async () => {
    process.env.EMAIL_PROVIDER = 'sendgrid';
    process.env.SENDGRID_API_KEY = 'SG.test-key-not-real';
    process.env.EMAIL_FROM = 'parts@scoreassign.com';
    const calls = stubFetch(202);

    const { emailProvider } = await import('../src/services/email.js');
    const provider = emailProvider();
    expect(provider.name).toBe('sendgrid');
    await provider.send({ to: 'player@example.org', subject: 'Your parts', text: 'Alto 2' });

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.url).toBe('https://api.sendgrid.com/v3/mail/send');
    const headers = call.init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer SG.test-key-not-real');
    const body = JSON.parse(String(call.init.body));
    expect(body.personalizations[0].to[0].email).toBe('player@example.org');
    expect(body.from.email).toBe('parts@scoreassign.com');
    expect(body.subject).toBe('Your parts');
    expect(body.content[0].value).toBe('Alto 2');
    // The key travels in the header, never in the payload.
    expect(String(call.init.body)).not.toContain('SG.test-key-not-real');
  });

  it('raises a status-only error when SendGrid rejects the message', async () => {
    process.env.EMAIL_PROVIDER = 'sendgrid';
    process.env.SENDGRID_API_KEY = 'SG.test-key-not-real';
    stubFetch(401);

    const { emailProvider } = await import('../src/services/email.js');
    await expect(
      emailProvider().send({ to: 'player@example.org', subject: 'Your parts', text: 'Alto 2' }),
    ).rejects.toThrow('SendGrid responded 401');
  });
});

describe('email templates', () => {
  it('builds a magic link on the tenant origin and a parts summary', async () => {
    const { assignmentNoticeEmail, magicLinkEmail } = await import('../src/services/email.js');
    const link = magicLinkEmail({
      to: 'player@example.org',
      origin: 'https://afs.scoreassign.com',
      token: 'opaque-token',
    });
    expect(link.text).toContain('https://afs.scoreassign.com/musician/verify?token=opaque-token');

    const notice = assignmentNoticeEmail({
      to: 'player@example.org',
      musicianName: 'Dana',
      tenantName: 'Arizona Flute Society',
      lines: ['Nocturne — Alto Flute 2'],
    });
    expect(notice.subject).toBe('Your parts for Arizona Flute Society');
    expect(notice.text).toContain('Nocturne — Alto Flute 2');
  });
});
