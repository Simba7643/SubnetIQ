import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { createLogger } from './observability/logger.js';

dotenv.config({
  path: [
    fileURLToPath(new URL('../.env', import.meta.url)),
    fileURLToPath(new URL('../../../.env', import.meta.url)),
  ],
  quiet: true,
});
const config = loadConfig();
const logger = createLogger(config.logLevel);
const app = createApp({ config, logger });
const server = app.listen(config.port, config.host, () =>
  logger.info({
    event: 'server_started',
    port: config.port,
    mode: config.supabaseUrl ? 'accounts-configured' : 'guest',
    provider: config.aiProvider,
  }),
);
server.requestTimeout = 20000;
server.headersTimeout = 15000;
server.keepAliveTimeout = 5000;
server.maxRequestsPerSocket = 1000;
let stopping = false;
function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ event: 'server_stopping', reason: signal });
  server.close(() => {
    process.exitCode = 0;
  });
  server.closeIdleConnections();
  const deadline = setTimeout(() => {
    server.closeAllConnections();
    process.exit(1);
  }, 15000);
  deadline.unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', () => {
  logger.error({ event: 'unhandled_rejection', code: 'PROCESS_ERROR' });
  shutdown('unhandledRejection');
});
