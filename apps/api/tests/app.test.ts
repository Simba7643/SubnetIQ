import { describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import type { AuthService } from '../src/middleware/auth.js';
import { AppError } from '../src/middleware/errors.js';
import type { LookupService } from '../src/services/lookups/index.js';

const config = () =>
  loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    RATE_LIMIT_SECRET: 'test-secret-with-at-least-32-characters',
  });
const token = 'signed-session-placeholder'.repeat(2);
const userId = 'd08a9cc1-cc03-4447-bf65-87b9e8df7c0d';
const projectId = '2b1995d9-0e40-4c5e-bf27-9234a820cfc7';

function fakeAuth(client: unknown = {}, service?: unknown): AuthService {
  return {
    configured: true,
    service: service as SupabaseClient | undefined,
    verify: jest.fn(async () => ({ userId, accessToken: token, client: client as SupabaseClient })),
  };
}

describe('HTTP contract', () => {
  it('runs guest mode without pretending that persistence is configured', async () => {
    const app = createApp({ config: config() });
    const health = await request(app).get('/api/health');
    expect(health.status).toBe(200);
    expect(health.body.status).toBe('ok');
    const ready = await request(app).get('/api/ready');
    expect(ready.body.mode).toBe('guest');
    expect(ready.body.persistenceConfigured).toBe(false);
    const projects = await request(app).get('/api/projects');
    expect(projects.status).toBe(503);
    expect(projects.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(projects.headers['cache-control']).toContain('no-store');
  });

  it('calculates a guest IPv4 network and rejects invalid addresses', async () => {
    const app = createApp({ config: config() });
    const valid = await request(app)
      .post('/api/calculate/ipv4-subnet')
      .send({ address: '192.168.10.40/24', policy: 'lan' });
    expect(valid.status).toBe(200);
    expect(valid.body.toolId).toBe('ipv4-subnet');
    expect(JSON.stringify(valid.body.summary)).toContain('192.168.10.0');
    expect(valid.body.steps.length).toBeGreaterThan(0);
    const invalid = await request(app)
      .post('/api/calculate/ipv4-subnet')
      .send({ address: '999.0.0.1/24' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('CALCULATION_ERROR');
  });

  it('returns structured input, content type, body size and route errors', async () => {
    const app = createApp({ config: config() });
    expect((await request(app).post('/api/calculate/no-such-tool').send({})).status).toBe(400);
    const malformed = await request(app)
      .post('/api/calculate/ipv4-subnet')
      .set('Content-Type', 'application/json')
      .send('{bad');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('INVALID_JSON');
    expect(
      (await request(app).post('/api/calculate/ipv4-subnet').type('text').send('text')).status,
    ).toBe(415);
    const oversized = await request(app)
      .post('/api/calculate/ipv4-subnet')
      .send({ value: 'x'.repeat(550000) });
    expect(oversized.status).toBe(413);
    const missing = await request(app).get('/api/no-such-endpoint');
    expect(missing.status).toBe(404);
    expect(missing.body.error.requestId).toEqual(expect.any(String));
    expect(missing.headers['x-powered-by']).toBeUndefined();
    expect(missing.headers['x-content-type-options']).toBe('nosniff');
  });

  it('allows only explicitly configured browser origins', async () => {
    const app = createApp({ config: config() });
    const allowed = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(allowed.status).toBe(200);
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const denied = await request(app).get('/api/health').set('Origin', 'https://untrusted.example');
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('rejects missing or invalid bearer credentials before querying saved work', async () => {
    const auth = fakeAuth();
    const app = createApp({ config: config(), auth });
    expect((await request(app).get('/api/projects')).status).toBe(401);
    expect((await request(app).get('/api/projects').set('Authorization', 'Basic bad')).status).toBe(
      401,
    );
    expect(auth.verify).not.toHaveBeenCalled();
    auth.verify = jest.fn(async () => {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired session.');
    });
    expect(
      (await request(app).get('/api/projects').set('Authorization', `Bearer ${token}`)).status,
    ).toBe(401);
    expect(auth.verify).toHaveBeenCalledWith(token);
  });

  it('rejects user-supplied owner fields before a project write', async () => {
    const auth = fakeAuth();
    const app = createApp({ config: config(), auth });
    const result = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Branch', owner_id: projectId });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('uses the verified user client for atomic project changes and exposes stale version conflicts', async () => {
    const rpc = jest.fn(async () => ({ data: null, error: { code: '40001' } }));
    const serviceRpc = jest.fn();
    const auth = fakeAuth({ rpc }, { rpc: serviceRpc });
    const result = await request(createApp({ config: config(), auth }))
      .patch(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 3, name: 'Changed' });
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('VERSION_CONFLICT');
    expect(rpc).toHaveBeenCalledWith('mutate_project', {
      p_project_id: projectId,
      p_expected_version: 3,
      p_changes: { name: 'Changed' },
    });
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it('supports project payloads above the general limit while retaining the plan and body caps', async () => {
    const rpc = jest.fn(async () => ({ data: { id: projectId, version: 2 }, error: null }));
    const app = createApp({ config: config(), auth: fakeAuth({ rpc }) });
    const valid = await request(app)
      .patch(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 1, plan: { notes: 'x'.repeat(600000) } });
    expect(valid.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    const planTooLarge = await request(app)
      .patch(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 1, plan: { notes: 'x'.repeat(2100000) } });
    expect(planTooLarge.status).toBe(400);
    expect(planTooLarge.body.error.code).toBe('PLAN_TOO_LARGE');
    const bodyTooLarge = await request(app)
      .patch(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 1, plan: { notes: 'x'.repeat(2400000) } });
    expect(bodyTooLarge.status).toBe(413);
    expect(bodyTooLarge.body.error.message).toContain('2.25 MiB');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('hashes public share tokens and treats absent/revoked snapshots identically', async () => {
    const shareToken = 'a'.repeat(43);
    const rpc = jest.fn(async () => ({ data: null, error: null }));
    const app = createApp({ config: config(), auth: fakeAuth({}, { rpc }) });
    const result = await request(app).get(`/api/share/${shareToken}`);
    expect(result.status).toBe(404);
    expect(result.headers['cache-control']).toContain('no-store');
    expect(rpc).toHaveBeenCalledWith('resolve_shared_project', {
      p_token_hash: createHash('sha256').update(shareToken).digest('hex'),
    });
    expect((await request(app).get('/api/share/invalid')).status).toBe(400);
  });

  it('validates lookup shapes before calling an upstream transport', async () => {
    const dns = jest.fn<LookupService['dns']>();
    const ipInfo = jest.fn<LookupService['ipInfo']>();
    const app = createApp({ config: config(), lookups: { dns, ipInfo } });
    expect(
      (await request(app).post('/api/lookups/ip-info').send({ address: 'http://169.254.169.254/' }))
        .status,
    ).toBe(400);
    expect(
      (await request(app).post('/api/lookups/dns').send({ name: 'example.com', type: 'AXFR' }))
        .status,
    ).toBe(400);
    expect(dns).not.toHaveBeenCalled();
    expect(ipInfo).not.toHaveBeenCalled();
  });

  it('keeps live lookup failures explicit', async () => {
    const dns = jest
      .fn<LookupService['dns']>()
      .mockRejectedValue(new AppError(502, 'UPSTREAM_UNAVAILABLE', 'Resolver unreachable.'));
    const app = createApp({
      config: config(),
      lookups: { dns, ipInfo: jest.fn<LookupService['ipInfo']>() },
    });
    const result = await request(app)
      .post('/api/lookups/dns')
      .send({ name: 'example.com', type: 'A' });
    expect(result.status).toBe(502);
    expect(result.body.error.code).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('streams a visibly labeled demo with deterministic calculation context', async () => {
    const app = createApp({ config: config() });
    const status = await request(app).get('/api/ai/status');
    expect(status.body).toMatchObject({ configured: false, provider: 'mock', mode: 'demo' });
    const response = await request(app)
      .post('/api/ai/chat')
      .send({
        messages: [{ role: 'user', content: 'Explain this subnet' }],
        context: { toolId: 'ipv4-subnet', input: { address: '192.168.10.40/24' } },
      });
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    const events = response.text
      .split('\n\n')
      .filter((line: string) => line.startsWith('data:'))
      .map((line: string) => JSON.parse(line.slice(5)));
    expect(events[0]).toMatchObject({
      type: 'meta',
      mode: 'demo',
      provider: 'mock',
      persisted: false,
    });
    expect(
      events
        .filter((event: { type: string }) => event.type === 'delta')
        .map((event: { content: string }) => event.content)
        .join(''),
    ).toContain('AI not configured — demo response');
    expect(events[events.length - 1].type).toBe('done');
  });

  it('enforces the per-identity assistant quota', async () => {
    const configured = { ...config(), aiDailyLimit: 1 };
    const app = createApp({ config: configured });
    await request(app)
      .post('/api/ai/chat')
      .send({ messages: [{ role: 'user', content: 'IPv6' }] });
    const limited = await request(app)
      .post('/api/ai/chat')
      .send({ messages: [{ role: 'user', content: 'IPv6' }] });
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
  });
});
