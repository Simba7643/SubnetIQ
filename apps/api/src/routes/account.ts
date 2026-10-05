import { readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { fromGeneratedId, type QuizQuestion } from '@subnetiq/shared';
import { authContext, authenticate, requireService, type AuthService } from '../middleware/auth.js';
import { AppError, asyncRoute, unwrap } from '../middleware/errors.js';
import type { AppConfig } from '../config/env.js';

const uuid = z.string().uuid();
const pagination = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});
const quizSchema = z
  .object({
    questionId: z.string().min(1).max(150),
    answerIndex: z.number().int().min(0).max(7),
    topic: z.string().min(1).max(100),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced', 'exam']),
    durationMs: z.number().int().min(0).max(86400000),
    seed: z.union([z.number().int().min(0).max(4294967295), z.string().max(40)]).optional(),
  })
  .strict();
const questionSchema = z.object({
  id: z.string(),
  topic: z.string(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced', 'exam']),
  question: z.string(),
  options: z.array(z.string()).min(2).max(8),
  correctIndex: z.number().int().nonnegative(),
  explanation: z.string(),
});
let quizBank: Map<string, QuizQuestion> | undefined;

export async function resolveQuestion(id: string): Promise<QuizQuestion | undefined> {
  const generated = fromGeneratedId(id);
  if (generated) return generated;
  if (!quizBank) {
    let contents: string;
    try {
      contents = await readFile(
        new URL('../../../../data/quiz-bank.json', import.meta.url),
        'utf8',
      );
    } catch {
      throw new AppError(
        503,
        'CONTENT_UNAVAILABLE',
        'The quiz bank is missing from the deployed release. Restore the data directory.',
      );
    }
    const parsed = z.array(questionSchema).safeParse(JSON.parse(contents));
    if (!parsed.success)
      throw new AppError(503, 'CONTENT_UNAVAILABLE', 'The deployed quiz bank failed validation.');
    quizBank = new Map(parsed.data.map((question) => [question.id, question]));
  }
  return quizBank.get(id);
}

async function deleteStoredFiles(service: SupabaseClient, userId: string): Promise<number> {
  let total = 0;
  for (const bucketName of ['exports', 'avatars']) {
    const bucket = service.storage.from(bucketName);
    const paths: string[] = [];
    const folders = [userId];
    while (folders.length) {
      const folder = folders.shift()!;
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await bucket.list(folder, {
          limit: 1000,
          offset,
          sortBy: { column: 'name', order: 'asc' },
        });
        if (error)
          throw new AppError(
            503,
            'ACCOUNT_DELETE_FAILED',
            'Stored files could not be inspected. Your account has not been deleted. Retry after Storage is available.',
          );
        const entries = data ?? [];
        for (const entry of entries) {
          if (!entry.name || entry.name.includes('/') || entry.name === '.' || entry.name === '..')
            throw new AppError(
              503,
              'ACCOUNT_DELETE_FAILED',
              'A stored object has an unsupported path. Contact the deployment operator.',
            );
          const path = `${folder}/${entry.name}`;
          if (entry.id) paths.push(path);
          else folders.push(path);
          if (paths.length + folders.length > 20000)
            throw new AppError(
              413,
              'ACCOUNT_DELETE_TOO_LARGE',
              'This account requires an operator-assisted Storage cleanup before deletion.',
            );
        }
        if (entries.length < 1000) break;
      }
    }
    for (let index = 0; index < paths.length; index += 100) {
      const { error } = await bucket.remove(paths.slice(index, index + 100));
      if (error)
        throw new AppError(
          503,
          'ACCOUNT_DELETE_PARTIAL',
          'Some stored files could not be removed. The account still exists; retry deletion to complete cleanup.',
        );
      total += Math.min(100, paths.length - index);
    }
  }
  return total;
}

export function accountRoutes(auth: AuthService, config: AppConfig): Router {
  const router = Router();
  router.use(
    ['/profile', '/favorites', '/quiz-attempts', '/practice/stats', '/history', '/account'],
    authenticate(auth, true),
  );
  router.get(
    '/profile',
    asyncRoute(async (_request, response) => {
      const { client, userId } = authContext(response);
      response.json(
        unwrap(
          await client
            .from('profiles')
            .select('id,display_name,avatar_path,preferences,created_at,updated_at')
            .eq('id', userId)
            .single(),
        ),
      );
    }),
  );
  router.patch(
    '/profile',
    asyncRoute(async (request, response) => {
      const input = z
        .object({
          display_name: z.string().trim().min(1).max(100).optional(),
          avatar_path: z.string().max(300).nullable().optional(),
          preferences: z.record(z.unknown()).optional(),
        })
        .strict()
        .parse(request.body);
      const { client, userId } = authContext(response);
      if (
        input.avatar_path &&
        (!input.avatar_path.startsWith(`${userId}/`) ||
          input.avatar_path.includes('..') ||
          input.avatar_path.includes('://'))
      )
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'The avatar must be an object within your private avatar folder.',
        );
      if (JSON.stringify(input.preferences ?? {}).length > 8000)
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'Profile preferences exceed the permitted size.',
        );
      response.json(
        unwrap(
          await client
            .from('profiles')
            .update(input)
            .eq('id', userId)
            .select('id,display_name,avatar_path,preferences,created_at,updated_at')
            .single(),
        ),
      );
    }),
  );
  router.get(
    '/favorites',
    asyncRoute(async (_request, response) => {
      const { client } = authContext(response);
      response.json(
        unwrap(
          await client
            .from('favorites')
            .select('id,tool_id,label,created_at')
            .order('created_at', { ascending: false })
            .limit(500),
        ),
      );
    }),
  );
  router.post(
    '/favorites',
    asyncRoute(async (request, response) => {
      const input = z
        .object({
          tool_id: z.string().regex(/^[a-z][a-z0-9-]{1,80}$/),
          label: z.string().trim().max(100).default(''),
        })
        .strict()
        .parse(request.body);
      const { client, userId } = authContext(response);
      const row = unwrap(
        await client
          .from('favorites')
          .upsert({ ...input, owner_id: userId }, { onConflict: 'owner_id,tool_id' })
          .select('id,tool_id,label,created_at')
          .single(),
      );
      response.status(201).json(row);
    }),
  );
  router.delete(
    '/favorites/:id',
    asyncRoute(async (request, response) => {
      const { client } = authContext(response);
      unwrap(
        await client
          .from('favorites')
          .delete()
          .eq('id', uuid.parse(request.params.id))
          .select('id')
          .single(),
      );
      response.status(204).end();
    }),
  );
  router.post(
    '/quiz-attempts',
    asyncRoute(async (request, response) => {
      const input = quizSchema.parse(request.body);
      const { userId } = authContext(response);
      const service = requireService(auth);
      const question = await resolveQuestion(input.questionId);
      if (!question)
        throw new AppError(
          400,
          'UNKNOWN_QUESTION',
          'This question is not in the current quiz bank. Refresh the exercise.',
        );
      if (
        question.topic !== input.topic ||
        question.difficulty !== input.difficulty ||
        input.answerIndex >= question.options.length
      )
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'The question metadata or answer choice does not match the current quiz.',
        );
      const correct = input.answerIndex === question.correctIndex;
      const attempt = unwrap(
        await service
          .from('quiz_attempts')
          .insert({
            owner_id: userId,
            question_id: question.id,
            answer_index: input.answerIndex,
            correct,
            topic: question.topic,
            difficulty: question.difficulty,
            duration_ms: input.durationMs,
            seed: input.seed === undefined ? null : String(input.seed),
          })
          .select('id,question_id,answer_index,correct,topic,difficulty,duration_ms,created_at')
          .single(),
      );
      response.status(201).json({
        attempt,
        correct,
        correctIndex: question.correctIndex,
        explanation: question.explanation,
      });
    }),
  );
  router.get(
    '/quiz-attempts',
    asyncRoute(async (request, response) => {
      const { client } = authContext(response);
      const { limit, offset } = pagination.parse(request.query);
      response.json(
        unwrap(
          await client
            .from('quiz_attempts')
            .select(
              'id,question_id,answer_index,correct,topic,difficulty,duration_ms,seed,created_at',
            )
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1),
        ),
      );
    }),
  );
  router.get(
    '/practice/stats',
    asyncRoute(async (_request, response) => {
      const { client } = authContext(response);
      response.json(
        unwrap(
          await client
            .from('practice_stats')
            .select(
              'topic,difficulty,attempts,correct_answers,total_duration_ms,best_streak,current_streak,last_practiced_at',
            )
            .order('last_practiced_at', { ascending: false })
            .limit(500),
        ),
      );
    }),
  );
  router.get(
    '/history',
    asyncRoute(async (_request, response) => {
      const { client } = authContext(response);
      const [calculations, quizAttempts, conversations] = await Promise.all([
        client
          .from('saved_calculations')
          .select('id,name,tool_id,created_at')
          .order('created_at', { ascending: false })
          .limit(100),
        client
          .from('quiz_attempts')
          .select('id,question_id,correct,topic,difficulty,created_at')
          .order('created_at', { ascending: false })
          .limit(100),
        client
          .from('ai_conversations')
          .select('id,title,created_at,updated_at')
          .order('updated_at', { ascending: false })
          .limit(100),
      ]);
      response.json({
        calculations: unwrap(calculations),
        quizAttempts: unwrap(quizAttempts),
        conversations: unwrap(conversations),
        limitPerCategory: 100,
      });
    }),
  );
  router.get(
    '/account/export',
    asyncRoute(async (_request, response) => {
      const { client, userId, email } = authContext(response);
      const tableNames = [
        'profiles',
        'projects',
        'saved_networks',
        'vlsm_plans',
        'vlsm_segments',
        'saved_calculations',
        'project_revisions',
        'project_shares',
        'quiz_attempts',
        'practice_stats',
        'ai_conversations',
        'ai_messages',
        'ai_usage_events',
        'favorites',
        'feedback',
      ];
      const output: Record<string, unknown> = {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        account: { id: userId, email },
        data: {},
      };
      const tables = output.data as Record<string, unknown>;
      let bytes = 0;
      for (const table of tableNames) {
        const rows: unknown[] = [];
        for (let offset = 0; ; offset += 250) {
          const query = client
            .from(table)
            .select('*')
            .eq(table === 'profiles' ? 'id' : 'owner_id', userId)
            .order(table === 'practice_stats' ? 'last_practiced_at' : 'created_at', {
              ascending: true,
            })
            .range(offset, offset + 249);
          const page = unwrap(await query) as Array<Record<string, unknown>>;
          for (const row of page) {
            if (table === 'project_shares') delete row.token_hash;
            bytes += Buffer.byteLength(JSON.stringify(row));
            if (bytes > 25 * 1024 * 1024 || rows.length >= 50000)
              throw new AppError(
                413,
                'EXPORT_TOO_LARGE',
                'Your data exceeds the 25 MiB interactive export limit. Use paginated endpoints or ask the deployment operator for a full database export.',
              );
            rows.push(row);
          }
          if (page.length < 250) break;
        }
        tables[table] = rows;
      }
      response.setHeader('Content-Disposition', 'attachment; filename="subnetiq-account.json"');
      response.json(output);
    }),
  );
  router.delete(
    '/account',
    asyncRoute(async (_request, response) => {
      const { userId } = authContext(response);
      const service = requireService(auth);
      const removedFiles = await deleteStoredFiles(service, userId);
      const subject = createHmac('sha256', config.rateLimitSecret)
        .update(`user:${userId}`)
        .digest('hex');
      const quotaPurge = await service.rpc('purge_quota_subject', { p_subject: subject });
      if (quotaPurge.error)
        throw new AppError(
          503,
          'ACCOUNT_DELETE_PARTIAL',
          'Stored files were removed, but operational usage cleanup did not finish. Retry deletion to complete the account removal.',
        );
      const { error } = await service.auth.admin.deleteUser(userId);
      if (error)
        throw new AppError(
          503,
          'ACCOUNT_DELETE_PARTIAL',
          'Stored files were removed, but account deletion did not finish. Retry to remove the account and its database records.',
        );
      response.json({ deleted: true, removedFiles });
    }),
  );
  return router;
}
