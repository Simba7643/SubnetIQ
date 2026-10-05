import { createHash, randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { z } from 'zod';
import { calculate } from '@subnetiq/netcalc';
import { toolIds } from '@subnetiq/shared';
import { loadConfig, type AppConfig } from './config/env.js';
import {
  authenticate,
  createAuthService,
  requireService,
  type AuthContext,
  type AuthService,
} from './middleware/auth.js';
import { AppError, asyncRoute, errorHandler, unwrap } from './middleware/errors.js';
import {
  limitRequests,
  MemoryQuotaStore,
  PostgresQuotaStore,
  type QuotaStore,
} from './middleware/quota.js';
import { createLogger, type Logger } from './observability/logger.js';
import { accountRoutes } from './routes/account.js';
import { aiRoutes } from './routes/ai.js';
import { projectRoutes } from './routes/projects.js';
import { createProvider } from './services/ai/index.js';
import type { AiProvider } from './services/ai/providers/types.js';
import {
  createLookupService,
  dnsSchema,
  ipInfoSchema,
  type LookupService,
} from './services/lookups/index.js';
import {
  MemoryLookupCache,
  PostgresLookupCache,
  type LookupCache,
} from './services/lookups/cache.js';
import { SafeJsonTransport } from './security/network.js';

export interface AppOptions {
  config?: AppConfig;
  auth?: AuthService;
  quota?: QuotaStore;
  logger?: Logger;
  provider?: AiProvider;
  lookups?: LookupService;
  lookupCache?: LookupCache;
}

export function createApp(options: AppOptions = {}): Express {
  const config = options.config ?? loadConfig();
  const logger = options.logger ?? createLogger(config.logLevel);
  const auth = options.auth ?? createAuthService(config);
  const quota =
    options.quota ??
    (config.quotaStore === 'postgres'
      ? new PostgresQuotaStore(requireService(auth))
      : new MemoryQuotaStore());
  const cache =
    options.lookupCache ??
    (config.quotaStore === 'postgres'
      ? new PostgresLookupCache(requireService(auth))
      : new MemoryLookupCache());
  const lookups =
    options.lookups ??
    createLookupService(new SafeJsonTransport(config.lookupTimeoutMs), cache, {
      maxConcurrent: config.lookupMaxConcurrent,
      whoisFallback: config.whoisFallbackEnabled,
      timeoutMs: config.lookupTimeoutMs,
    });
  const provider = options.provider ?? createProvider(config);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxyHops);
  app.use((request, response, next) => {
    const requestId = randomUUID();
    response.locals.requestId = requestId;
    response.setHeader('X-Request-ID', requestId);
    response.setHeader('Cache-Control', 'no-store');
    const started = performance.now();
    response.once('finish', () =>
      logger.info({
        event: 'request',
        requestId,
        method: request.method,
        route: request.route?.path ?? 'unmatched',
        status: response.statusCode,
        durationMs: Math.round(performance.now() - started),
      }),
    );
    next();
  });
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || config.webOrigins.includes(origin)) callback(null, true);
        else
          callback(
            new AppError(
              403,
              'ORIGIN_NOT_ALLOWED',
              'This origin is not permitted to call the API.',
            ),
          );
      },
      credentials: false,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type'],
      exposedHeaders: [
        'X-Request-ID',
        'RateLimit-Limit',
        'RateLimit-Remaining',
        'RateLimit-Reset',
        'Retry-After',
      ],
      maxAge: 600,
    }),
  );
  app.get('/api/health', (_request, response) =>
    response.json({ status: 'ok', service: 'subnetiq-api', version: '1.0.0' }),
  );
  app.get(
    '/api/ready',
    asyncRoute(async (_request, response) => {
      if (config.quotaStore === 'postgres') {
        const { error } = await requireService(auth).rpc('get_lookup_cache', {
          p_key: 'health:readiness',
        });
        if (error)
          throw new AppError(
            503,
            'DEPENDENCY_UNAVAILABLE',
            'Database migrations or connectivity are not ready.',
          );
      }
      response.json({
        status: 'ready',
        mode: auth.configured ? 'accounts-configured' : 'guest',
        database: config.quotaStore === 'postgres' ? 'reachable' : 'not-probed',
        persistenceConfigured: auth.configured,
        ai: { provider: provider.name, configured: provider.configured, mode: provider.mode },
        quotaStore: config.quotaStore,
      });
    }),
  );
  app.use('/api', limitRequests(quota, config.rateLimitSecret, 'api-minute', 180, 60));
  const projectJson = express.json({ limit: '2304kb', strict: true, type: 'application/json' });
  app.use('/api/projects', (request, response, next) => {
    if (request.method === 'POST' || request.method === 'PATCH')
      projectJson(request, response, next);
    else next();
  });
  app.use(express.json({ limit: '512kb', strict: true, type: 'application/json' }));
  app.use((request, _response, next) => {
    if (['POST', 'PATCH'].includes(request.method) && !request.is('application/json'))
      throw new AppError(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'Send JSON using Content-Type: application/json.',
      );
    next();
  });
  app.post(
    '/api/calculate/:tool',
    limitRequests(quota, config.rateLimitSecret, 'calculate-minute', 90, 60),
    (request, response, next) => {
      try {
        const tool = z.enum(toolIds).parse(request.params.tool);
        const input = z.record(z.unknown()).parse(request.body);
        try {
          response.json(calculate(tool, input));
        } catch (error) {
          next(
            new AppError(
              400,
              'CALCULATION_ERROR',
              error instanceof Error ? error.message : 'Invalid calculation input.',
            ),
          );
        }
      } catch (error) {
        next(error);
      }
    },
  );
  app.post(
    '/api/lookups/dns',
    limitRequests(quota, config.rateLimitSecret, 'lookup-minute', 30, 60),
    asyncRoute(async (request, response) =>
      response.json(await lookups.dns(dnsSchema.parse(request.body))),
    ),
  );
  app.post(
    '/api/lookups/ip-info',
    limitRequests(quota, config.rateLimitSecret, 'lookup-minute', 30, 60),
    asyncRoute(async (request, response) =>
      response.json(await lookups.ipInfo(ipInfoSchema.parse(request.body))),
    ),
  );
  app.get(
    '/api/share/:token',
    limitRequests(quota, config.rateLimitSecret, 'share-minute', 60, 60),
    asyncRoute(async (request, response) => {
      const token = z
        .string()
        .regex(/^[A-Za-z0-9_-]{43}$/)
        .parse(request.params.token);
      const hash = createHash('sha256').update(token).digest('hex');
      const { data, error } = await requireService(auth).rpc('resolve_shared_project', {
        p_token_hash: hash,
      });
      if (error)
        throw new AppError(
          503,
          'SHARE_UNAVAILABLE',
          'Shared projects are temporarily unavailable.',
        );
      if (!data) throw new AppError(404, 'NOT_FOUND', 'This link is invalid, expired, or revoked.');
      response.setHeader('Referrer-Policy', 'no-referrer');
      response.json(data);
    }),
  );
  app.post(
    '/api/feedback',
    authenticate(auth, false),
    limitRequests(quota, config.rateLimitSecret, 'feedback-hour', 5, 3600),
    asyncRoute(async (request, response) => {
      const input = z
        .object({
          message: z.string().trim().min(10).max(5000),
          email: z.string().email().max(254).optional(),
        })
        .strict()
        .parse(request.body);
      const identity = response.locals.auth as AuthContext | undefined;
      const client = identity?.client ?? requireService(auth);
      const row = unwrap(
        await client
          .from('feedback')
          .insert({
            owner_id: identity?.userId ?? null,
            email: input.email ?? identity?.email ?? null,
            message: input.message,
          })
          .select('id,created_at')
          .single(),
      );
      response.status(201).json(row);
    }),
  );
  app.use('/api', aiRoutes(config, auth, provider, quota, logger));
  app.use('/api', projectRoutes(auth));
  app.use('/api', accountRoutes(auth, config));
  app.use((_request, _response, next) =>
    next(new AppError(404, 'NOT_FOUND', 'The requested endpoint does not exist.')),
  );
  app.use(errorHandler(logger));
  return app;
}
