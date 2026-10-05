import { once } from 'node:events';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { calculate } from '@subnetiq/netcalc';
import { chatSchema, toolIds } from '@subnetiq/shared';
import type { AppConfig } from '../config/env.js';
import {
  authenticate,
  authContext,
  requireService,
  type AuthContext,
  type AuthService,
} from '../middleware/auth.js';
import { AppError, asyncRoute, unwrap } from '../middleware/errors.js';
import { limitRequests, type QuotaStore } from '../middleware/quota.js';
import type { Logger } from '../observability/logger.js';
import { MockProvider } from '../services/ai/providers/mock.js';
import type { AiInput, AiProvider } from '../services/ai/providers/types.js';

const uuid = z.string().uuid();

export function canonicalContext(
  value: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const toolId = z.enum(toolIds).parse(value.toolId ?? value.tool);
  const input = z.record(z.unknown()).parse(value.input ?? value.normalizedInput);
  if (JSON.stringify(input).length > 24000)
    throw new AppError(
      400,
      'CONTEXT_TOO_LARGE',
      'Attach a smaller calculation or fewer planned segments.',
    );
  try {
    const result = calculate(toolId, input);
    const context = {
      toolId: result.toolId,
      title: result.title,
      normalizedInput: result.normalizedInput,
      summary: result.summary,
      steps: result.steps,
      warnings: result.warnings,
      engineVersion: result.engineVersion,
    };
    if (JSON.stringify(context).length > 40000)
      throw new AppError(
        400,
        'CONTEXT_TOO_LARGE',
        'The calculation explanation is too large to attach. Use a smaller plan.',
      );
    return context;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      400,
      'CALCULATION_ERROR',
      error instanceof Error ? error.message : 'The attached calculation could not be verified.',
    );
  }
}

async function sendEvent(
  response: Response,
  value: Record<string, unknown>,
  signal: AbortSignal,
): Promise<void> {
  if (response.destroyed || signal.aborted) return;
  if (!response.write(`data: ${JSON.stringify(value)}\n\n`))
    await once(response, 'drain', { signal });
}

export function aiRoutes(
  config: AppConfig,
  auth: AuthService,
  provider: AiProvider,
  quota: QuotaStore,
  logger: Logger,
): Router {
  const router = Router();
  router.get('/ai/status', (_request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.json({
      configured: provider.configured,
      provider: provider.name,
      requestedProvider: config.aiProvider,
      mode: provider.mode,
      authenticationRequired: provider.mode === 'live',
      persistenceConfigured: auth.configured,
      dailyLimit: config.aiDailyLimit,
      message: provider.explanation ?? 'Live OpenAI responses are enabled for signed-in users.',
      adapters: { openai: 'implemented', anthropic: 'not-implemented', gemini: 'not-implemented' },
    });
  });
  router.post(
    '/ai/chat',
    authenticate(auth, false),
    limitRequests(quota, config.rateLimitSecret, 'ai-day', config.aiDailyLimit, 86400),
    asyncRoute(async (request, response) => {
      const parsed = chatSchema.strict().parse(request.body);
      const last = parsed.messages[parsed.messages.length - 1]!;
      if (last.role !== 'user')
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'The last chat message must be a user message.',
        );
      if (parsed.messages.reduce((count, message) => count + message.content.length, 0) > 48000)
        throw new AppError(
          400,
          'CONTEXT_TOO_LARGE',
          'The conversation exceeds the 48,000-character context limit. Start a new conversation.',
        );
      const context = canonicalContext(parsed.context);
      const identity = response.locals.auth as AuthContext | undefined;
      if (parsed.conversationId && !identity)
        throw new AppError(401, 'UNAUTHORIZED', 'Sign in to continue a saved conversation.');
      const selected =
        provider.mode === 'live' && !identity
          ? new MockProvider('Demo response — sign in to use the configured AI provider')
          : provider.mode === 'unavailable'
            ? new MockProvider(
                `AI not configured — demo response. ${provider.explanation ?? 'The selected adapter is unavailable.'}`,
              )
            : provider;
      if (selected.mode === 'live') requireService(auth);
      let conversationId = parsed.conversationId;
      let messages: AiInput['messages'] = parsed.messages;
      if (identity) {
        if (conversationId) {
          unwrap(
            await identity.client
              .from('ai_conversations')
              .select('id')
              .eq('id', conversationId)
              .single(),
          );
          const previous = unwrap(
            await identity.client
              .from('ai_messages')
              .select('role,content')
              .eq('conversation_id', conversationId)
              .order('created_at', { ascending: false })
              .order('id', { ascending: false })
              .limit(28),
          ) as AiInput['messages'];
          messages = [...previous.reverse(), last];
        } else {
          const row = unwrap(
            await identity.client
              .from('ai_conversations')
              .insert({ owner_id: identity.userId, title: last.content.slice(0, 100) })
              .select('id')
              .single(),
          );
          conversationId = row.id as string;
        }
        while (
          messages.length > 1 &&
          messages.reduce((count, message) => count + message.content.length, 0) > 48000
        )
          messages.shift();
        unwrap(
          await identity.client
            .from('ai_messages')
            .insert({
              owner_id: identity.userId,
              conversation_id: conversationId,
              role: 'user',
              content: last.content,
              provider: selected.name,
              mode: selected.mode,
            })
            .select('id')
            .single(),
        );
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(new Error('timeout')), config.aiTimeoutMs);
      const cancel = () => {
        if (!response.writableEnded) controller.abort(new Error('client_disconnected'));
      };
      response.once('close', cancel);
      response.status(200);
      response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      response.setHeader('Cache-Control', 'no-store, no-transform');
      response.setHeader('Connection', 'keep-alive');
      response.setHeader('X-Accel-Buffering', 'no');
      response.flushHeaders();
      let content = '';
      let inputTokens = 0;
      let outputTokens = 0;
      let outcome: 'completed' | 'cancelled' | 'failed' | 'demo' =
        selected.mode === 'demo' ? 'demo' : 'completed';
      let failure: AppError | undefined;
      try {
        await sendEvent(
          response,
          {
            type: 'meta',
            provider: selected.name,
            mode: selected.mode,
            ...(conversationId ? { conversationId } : {}),
            message: selected.explanation ?? 'Live response',
            persisted: Boolean(identity),
          },
          controller.signal,
        );
        for await (const chunk of selected.stream({ messages, context }, controller.signal)) {
          if (chunk.type === 'usage') {
            inputTokens = chunk.inputTokens;
            outputTokens = chunk.outputTokens;
          } else {
            content += chunk.content;
            if (content.length > 64000)
              throw new AppError(
                502,
                'AI_OUTPUT_LIMIT',
                'The response exceeded the permitted output size.',
              );
            await sendEvent(response, { type: 'delta', content: chunk.content }, controller.signal);
          }
        }
      } catch (error) {
        if (controller.signal.aborted) {
          outcome = 'cancelled';
          if (!response.destroyed)
            failure = new AppError(
              504,
              'AI_TIMEOUT',
              'The response timed out. Ask a narrower question or retry.',
            );
        } else {
          outcome = 'failed';
          failure =
            error instanceof AppError
              ? error
              : new AppError(
                  502,
                  'AI_UNAVAILABLE',
                  'The assistant could not finish the response. Retry shortly.',
                );
        }
      } finally {
        clearTimeout(timeout);
        if (identity && conversationId) {
          try {
            if (content) {
              const suffix =
                outcome === 'cancelled'
                  ? '\n\n[Response stopped before completion.]'
                  : outcome === 'failed'
                    ? '\n\n[Response interrupted by an error.]'
                    : '';
              unwrap(
                await identity.client
                  .from('ai_messages')
                  .insert({
                    owner_id: identity.userId,
                    conversation_id: conversationId,
                    role: 'assistant',
                    content: content + suffix,
                    provider: selected.name,
                    mode: selected.mode,
                  })
                  .select('id')
                  .single(),
              );
            }
            unwrap(
              await identity.client
                .from('ai_conversations')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', conversationId)
                .select('id')
                .single(),
            );
            if (auth.service)
              unwrap(
                await auth.service
                  .from('ai_usage_events')
                  .insert({
                    owner_id: identity.userId,
                    conversation_id: conversationId,
                    provider: selected.name,
                    input_tokens: Math.max(0, Math.trunc(inputTokens)),
                    output_tokens: Math.max(0, Math.trunc(outputTokens)),
                    status: outcome,
                  })
                  .select('id')
                  .single(),
              );
          } catch {
            logger.error({
              event: 'ai_persistence_error',
              requestId: response.locals.requestId,
              code: 'SAVE_FAILED',
            });
            if (!response.destroyed)
              failure = new AppError(
                503,
                'AI_SAVE_FAILED',
                'The response could not be fully saved. Copy it before leaving and check your conversation history.',
              );
          }
        }
        if (!response.destroyed) {
          const finalSignal = new AbortController().signal;
          if (failure)
            await sendEvent(
              response,
              {
                type: 'error',
                code: failure.code,
                message: failure.message,
                ...(conversationId ? { conversationId } : {}),
              },
              finalSignal,
            );
          else
            await sendEvent(
              response,
              {
                type: 'done',
                provider: selected.name,
                mode: selected.mode,
                ...(conversationId ? { conversationId } : {}),
              },
              finalSignal,
            );
          response.end();
        }
        response.off('close', cancel);
      }
    }),
  );

  const protectedRouter = Router();
  protectedRouter.use('/ai/conversations', authenticate(auth, true));
  protectedRouter.get(
    '/ai/conversations',
    asyncRoute(async (request, response) => {
      const { client } = authContext(response);
      const { limit, offset } = z
        .object({
          limit: z.coerce.number().int().min(1).max(200).default(100),
          offset: z.coerce.number().int().nonnegative().max(100000).default(0),
        })
        .parse(request.query);
      response.json(
        unwrap(
          await client
            .from('ai_conversations')
            .select('id,title,created_at,updated_at')
            .order('updated_at', { ascending: false })
            .range(offset, offset + limit - 1),
        ),
      );
    }),
  );
  protectedRouter.post(
    '/ai/conversations',
    asyncRoute(async (request, response) => {
      const input = z
        .object({ title: z.string().trim().min(1).max(200).default('New conversation') })
        .strict()
        .parse(request.body ?? {});
      const { client, userId } = authContext(response);
      response.status(201).json(
        unwrap(
          await client
            .from('ai_conversations')
            .insert({ ...input, owner_id: userId })
            .select('id,title,created_at,updated_at')
            .single(),
        ),
      );
    }),
  );
  protectedRouter.get(
    '/ai/conversations/:id',
    asyncRoute(async (request, response) => {
      const { client } = authContext(response);
      response.json(
        unwrap(
          await client
            .from('ai_conversations')
            .select('id,title,created_at,updated_at')
            .eq('id', uuid.parse(request.params.id))
            .single(),
        ),
      );
    }),
  );
  protectedRouter.get(
    '/ai/conversations/:id/messages',
    asyncRoute(async (request, response) => {
      const id = uuid.parse(request.params.id);
      const { client } = authContext(response);
      const { limit, offset } = z
        .object({
          limit: z.coerce.number().int().min(1).max(500).default(200),
          offset: z.coerce.number().int().nonnegative().max(100000).default(0),
        })
        .parse(request.query);
      unwrap(await client.from('ai_conversations').select('id').eq('id', id).single());
      response.json(
        unwrap(
          await client
            .from('ai_messages')
            .select('id,role,content,provider,mode,created_at')
            .eq('conversation_id', id)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(offset, offset + limit - 1),
        ),
      );
    }),
  );
  protectedRouter.delete(
    '/ai/conversations/:id',
    asyncRoute(async (request, response) => {
      const { client } = authContext(response);
      unwrap(
        await client
          .from('ai_conversations')
          .delete()
          .eq('id', uuid.parse(request.params.id))
          .select('id')
          .single(),
      );
      response.status(204).end();
    }),
  );
  router.use(protectedRouter);
  return router;
}
