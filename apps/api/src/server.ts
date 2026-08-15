import { createApp } from './app.js';
import { config } from './config.js';
import { connect, disconnect } from './db/connection.js';
import { logger } from './logger.js';
import { ensurePlatformCatalog } from './services/provisioning.js';

async function main(): Promise<void> {
  await connect();
  await ensurePlatformCatalog();

  const server = createApp().listen(config.PORT, () => {
    logger.info({ port: config.PORT, env: config.NODE_ENV }, 'score-assign api listening');
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close(() => {
      void disconnect().finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  logger.error({ err: error }, 'failed to start api');
  process.exit(1);
});
