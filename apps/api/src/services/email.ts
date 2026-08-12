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

export function emailProvider(): EmailProvider {
  return new LogEmailProvider();
}

export function magicLinkEmail(params: {
  to: string;
  tenantSlug: string;
  token: string;
}): EmailMessage {
  const url = `https://${params.tenantSlug}.${config.APP_ROOT_DOMAIN}/musician/verify?token=${params.token}`;
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
