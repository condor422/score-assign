import { config } from '../config.js';
import { logger } from '../logger.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

/** Writes messages to the log so flows are verifiable without a mail account. */
class LogEmailProvider implements EmailProvider {
  readonly name = 'log';

  async send(message: EmailMessage): Promise<void> {
    logger.info({ from: config.EMAIL_FROM, ...message }, 'email (not sent: log provider)');
  }
}

/**
 * Talks to SendGrid's v3 REST API directly rather than through their SDK: one
 * POST is all this needs, and it keeps a dependency out of the tree.
 */
class SendGridEmailProvider implements EmailProvider {
  readonly name = 'sendgrid';

  async send(message: EmailMessage): Promise<void> {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.SENDGRID_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: message.to }] }],
        from: { email: config.EMAIL_FROM, name: config.EMAIL_FROM_NAME },
        subject: message.subject,
        content: [{ type: 'text/plain', value: message.text }],
      }),
    });

    if (!response.ok) {
      // The body carries SendGrid's reason; the address is deliberately not logged.
      const detail = await response.text().catch(() => '');
      logger.error({ status: response.status, detail }, 'sendgrid rejected a message');
      throw new Error(`SendGrid responded ${response.status}`);
    }
  }
}

let provider: EmailProvider | null = null;

export function emailProvider(): EmailProvider {
  if (!provider) {
    provider =
      config.EMAIL_PROVIDER === 'sendgrid' ? new SendGridEmailProvider() : new LogEmailProvider();
    logger.info({ provider: provider.name }, 'email provider selected');
  }
  return provider;
}

export function magicLinkEmail(params: {
  to: string;
  origin: string;
  token: string;
}): EmailMessage {
  const url = `${params.origin}/musician/verify?token=${params.token}`;
  return {
    to: params.to,
    subject: 'Your part assignment sign-in link',
    text: `Open this link to view and confirm your parts (valid for 30 minutes):\n\n${url}\n`,
  };
}

export function assignmentNoticeEmail(params: {
  to: string;
  musicianName: string;
  tenantName: string;
  lines: string[];
}): EmailMessage {
  return {
    to: params.to,
    subject: `Your parts for ${params.tenantName}`,
    text:
      `Hi ${params.musicianName},\n\nYou have been assigned the following parts:\n\n` +
      params.lines.map((l) => `  - ${l}`).join('\n') +
      '\n\nPlease sign in to confirm.\n',
  };
}
