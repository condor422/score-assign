import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';
import { logger } from './logger.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { authRouter } from './routes/auth.js';
import { catalogRouter } from './routes/catalog.js';
import { formsRouter } from './routes/forms.js';
import { publicIntakeRouter } from './routes/intake.js';
import { assignmentsRouter } from './routes/assignments.js';
import { billingRouter } from './routes/billing.js';
import { adminRouter } from './routes/admin.js';
import { teamRouter } from './routes/team.js';
import { rosterRouter } from './routes/roster.js';
import { musicianAuthRouter, musicianPortalRouter } from './routes/musicianPortal.js';

export function createApp(): Express {
  const app = express();

  // Cloud Run terminates TLS, so the client IP must come from the proxy chain
  // for rate limiting to key on the real caller.
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        const allowed =
          config.corsOrigins.includes(origin) ||
          // Any tenant subdomain of the app's own domain is a first-party origin.
          new RegExp(
            `^https?://[a-z0-9-]+\\.(${escapeRegExp(config.APP_ROOT_DOMAIN)}|localhost)(:\\d+)?$`,
          ).test(origin);
        callback(allowed ? null : new Error('Origin not allowed'), allowed);
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());
  if (config.NODE_ENV !== 'test') app.use(pinoHttp({ logger }));

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, service: 'score-assign-api' });
  });

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/public', publicIntakeRouter);
  app.use('/api/v1/musician-auth', musicianAuthRouter);
  app.use('/api/v1/musician', musicianPortalRouter);
  app.use('/api/v1/forms', formsRouter);
  app.use('/api/v1/roster', rosterRouter);
  app.use('/api/v1', catalogRouter);
  app.use('/api/v1', assignmentsRouter);
  app.use('/api/v1/billing', billingRouter);
  app.use('/api/v1/team', teamRouter);
  app.use('/api/v1/admin', adminRouter);

  app.use((_req, _res, next) => next(notFound('No such endpoint')));
  app.use(errorHandler);

  return app;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
