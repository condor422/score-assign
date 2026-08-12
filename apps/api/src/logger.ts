import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.NODE_ENV === 'test' ? 'silent' : config.isProduction ? 'info' : 'debug',
  // Never let a credential or token reach the log sink.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      '*.password',
      'token',
      '*.token',
    ],
    censor: '[redacted]',
  },
});
