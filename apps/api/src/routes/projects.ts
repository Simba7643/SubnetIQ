import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { calculate } from '@subnetiq/netcalc';
import { projectSchema, toolIds, type Project } from '@subnetiq/shared';
import { authenticate, authContext, type AuthService } from '../middleware/auth.js';
import { AppError, asyncRoute, unwrap } from '../middleware/errors.js';

const uuid = z.string().uuid('Enter a valid item identifier.');
const shareSchema = z
  .object({ expiresInDays: z.number().int().min(1).max(90).default(30) })
  .strict();
const pagination = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});
const fields = 'id,name,description,address_space,plan,version,archived,created_at,updated_at';
const savedCalculationSchema = z
  .object({
    tool_id: z.enum(toolIds),
    name: z.string().trim().min(1).max(100).optional(),
    title: z.string().trim().min(1).max(100).optional(),
    input: z.record(z.unknown()),
    result: z.unknown().optional(),
    project_id: z.string().uuid().nullable().optional(),
  })
  .strict();

function checkPlanSize(plan: Record<string, unknown> | undefined): void {
  if (plan && Buffer.byteLength(JSON.stringify(plan)) > 2097152)
    throw new AppError(
      400,
      'PLAN_TOO_LARGE',
      'The project plan exceeds 2 MiB. Split the plan into smaller projects.',
    );
}

function snapshot(project: Project): Record<string, unknown> {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    address_space: project.address_space,
    plan: project.plan,
    version: project.version,
    archived: project.archived ?? false,
    created_at: project.created_at,
    updated_at: project.updated_at,
  };
}

export function projectRoutes(auth: AuthService): Router {
  const router = Router();
  router.use(['/projects', '/saved-calculations', '/shares'], authenticate(auth, true));

  router.get(
    '/projects',
    asyncRoute(async (request, response) => {
      const { client } = authContext(response);
      const { limit, offset } = pagination.parse(request.query);
      const rows = unwrap(
        await client
          .from('projects')
          .select(fields)
          .order('updated_at', { ascending: false })
          .range(offset, offset + limit - 1),
      );
      response.json(rows);
    }),
  );
  router.post(
    '/projects',
    asyncRoute(async (request, response) => {
      const input = projectSchema.omit({ version: true }).strict().parse(request.body);
      checkPlanSize(input.plan);
      const { client, userId } = authContext(response);
      const row = unwrap(
        await client
          .from('projects')
          .insert({ ...input, owner_id: userId })
          .select(fields)
          .single(),
      );
      response.status(201).json(row);
    }),
  );
  router.get(
    '/projects/:id',
    asyncRoute(async (request, response) => {
      const id = uuid.parse(request.params.id);
      const { client } = authContext(response);
      response.json(unwrap(await client.from('projects').select(fields).eq('id', id).single()));
    }),
  );
  router.patch(
    '/projects/:id',
    asyncRoute(async (request, response) => {
      const id = uuid.parse(request.params.id);
      const schema = projectSchema
        .omit({ version: true })
        .partial()
        .extend({ version: z.number().int().positive() })
        .strict();
      const { version, ...changes } = schema.parse(request.body);
      checkPlanSize(changes.plan);
      if (!Object.keys(changes).length)
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'Provide at least one project field to update.',
        );
      const { client } = authContext(response);
      const result = unwrap(
        await client.rpc('mutate_project', {
          p_project_id: id,
          p_expected_version: version,
          p_changes: changes,
        }),
      );
      response.json(Array.isArray(result) ? result[0] : result);
    }),
  );
  router.delete(
    '/projects/:id',
    asyncRoute(async (request, response) => {
      const id = uuid.parse(request.params.id);
      const { client } = authContext(response);
      unwrap(await client.from('projects').delete().eq('id', id).select('id').single());
      response.status(204).end();
    }),
  );
  router.get(
    '/projects/:id/revisions',
    asyncRoute(async (request, response) => {
      const id = uuid.parse(request.params.id);
      const { client } = authContext(response);
      const { limit, offset } = pagination.parse(request.query);
      unwrap(await client.from('projects').select('id').eq('id', id).single());
      response.json(
        unwrap(
          await client
            .from('project_revisions')
            .select('id,project_id,name,snapshot,created_at')
            .eq('project_id', id)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1),
        ),
      );
    }),
  );
  router.post(
    '/projects/:id/revisions',
    asyncRoute(async (request, response) => {
      const id = uuid.parse(request.params.id);
      const { name } = z
        .object({ name: z.string().trim().max(100).default('Manual checkpoint') })
        .strict()
        .parse(request.body ?? {});
      const { client, userId } = authContext(response);
      const project = unwrap(
        await client.from('projects').select(fields).eq('id', id).single(),
      ) as Project;
      response.status(201).json(
        unwrap(
          await client
            .from('project_revisions')
            .insert({ owner_id: userId, project_id: id, name, snapshot: snapshot(project) })
            .select('id,project_id,name,snapshot,created_at')
            .single(),
        ),
      );
    }),
  );
  router.post(
    '/projects/:id/restore',
    asyncRoute(async (request, response) => {
      const id = uuid.parse(request.params.id);
      const input = z
        .object({ revisionId: uuid, version: z.number().int().positive().optional() })
        .strict()
        .parse(request.body);
      const { client } = authContext(response);
      const current = unwrap(await client.from('projects').select('version').eq('id', id).single());
      const row = unwrap(
        await client.rpc('restore_project', {
          p_project_id: id,
          p_revision_id: input.revisionId,
          p_expected_version: input.version ?? current.version,
        }),
      );
      response.json(Array.isArray(row) ? row[0] : row);
    }),
  );
  router.get(
    '/projects/:id/shares',
    asyncRoute(async (request, response) => {
      const id = uuid.parse(request.params.id);
      const { client } = authContext(response);
      unwrap(await client.from('projects').select('id').eq('id', id).single());
      response.json(
        unwrap(
          await client
            .from('project_shares')
            .select('id,project_id,expires_at,revoked_at,created_at')
            .eq('project_id', id)
            .order('created_at', { ascending: false })
            .limit(200),
        ),
      );
    }),
  );
  router.post(
    '/projects/:id/shares',
    asyncRoute(async (request, response) => {
      const id = uuid.parse(request.params.id);
      const { expiresInDays } = shareSchema.parse(request.body ?? {});
      const { client, userId } = authContext(response);
      const project = unwrap(
        await client.from('projects').select(fields).eq('id', id).single(),
      ) as Project;
      const token = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString();
      const row = unwrap(
        await client
          .from('project_shares')
          .insert({
            owner_id: userId,
            project_id: id,
            token_hash: tokenHash,
            snapshot: snapshot(project),
            expires_at: expiresAt,
          })
          .select('id,expires_at,created_at')
          .single(),
      );
      response.status(201).json({ ...row, token, url: `/share/${token}` });
    }),
  );
  router.delete(
    '/shares/:id',
    asyncRoute(async (request, response) => {
      const id = uuid.parse(request.params.id);
      const { client } = authContext(response);
      unwrap(
        await client
          .from('project_shares')
          .update({ revoked_at: new Date().toISOString() })
          .eq('id', id)
          .select('id')
          .single(),
      );
      response.status(204).end();
    }),
  );
  router.get(
    '/saved-calculations',
    asyncRoute(async (request, response) => {
      const { client } = authContext(response);
      const { limit, offset } = pagination.parse(request.query);
      response.json(
        unwrap(
          await client
            .from('saved_calculations')
            .select('id,project_id,name,tool_id,input,result,created_at,updated_at')
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1),
        ),
      );
    }),
  );
  router.post(
    '/saved-calculations',
    asyncRoute(async (request, response) => {
      const input = savedCalculationSchema.parse(request.body);
      const { client, userId } = authContext(response);
      let result;
      try {
        result = calculate(input.tool_id, input.input);
      } catch (error) {
        throw new AppError(
          400,
          'CALCULATION_ERROR',
          error instanceof Error ? error.message : 'The calculation input is invalid.',
        );
      }
      const row = unwrap(
        await client
          .from('saved_calculations')
          .insert({
            owner_id: userId,
            project_id: input.project_id ?? null,
            name: input.name ?? input.title ?? result.title.slice(0, 100),
            tool_id: input.tool_id,
            input: input.input,
            result,
          })
          .select('id,project_id,name,tool_id,input,result,created_at,updated_at')
          .single(),
      );
      response.status(201).json(row);
    }),
  );
  router.delete(
    '/saved-calculations/:id',
    asyncRoute(async (request, response) => {
      const id = uuid.parse(request.params.id);
      const { client } = authContext(response);
      unwrap(await client.from('saved_calculations').delete().eq('id', id).select('id').single());
      response.status(204).end();
    }),
  );
  return router;
}
