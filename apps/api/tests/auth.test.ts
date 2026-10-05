import { describe, expect, it, jest } from '@jest/globals';
import { createAuthService } from '../src/middleware/auth.js';
import { loadConfig } from '../src/config/env.js';

describe('Supabase token verification and RLS context', () => {
  it('verifies with Auth and carries the caller token into database operations', async () => {
    const jwt = 'a-real-access-token-placeholder';
    const userId = 'af0359b5-0bcb-48fa-91ee-22f67264d904';
    const fetcher = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
      const url = String(input);
      const headers = new Headers(options?.headers);
      if (url.includes('/auth/v1/user')) {
        expect(headers.get('Authorization')).toBe(`Bearer ${jwt}`);
        expect(headers.get('apikey')).toBe('public-key');
        return new Response(
          JSON.stringify({
            id: userId,
            email: 'owner@example.com',
            aud: 'authenticated',
            role: 'authenticated',
            app_metadata: {},
            user_metadata: {},
            created_at: new Date().toISOString(),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      expect(url).toContain('/rest/v1/projects');
      expect(headers.get('Authorization')).toBe(`Bearer ${jwt}`);
      expect(headers.get('apikey')).toBe('public-key');
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const config = loadConfig({
      NODE_ENV: 'test',
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_ANON_KEY: 'public-key',
      SUPABASE_SERVICE_ROLE_KEY: 'private-service-key',
    });
    const auth = createAuthService(config);
    const context = await auth.verify(jwt);
    expect(context.userId).toBe(userId);
    const { error } = await context.client.from('projects').select('id');
    expect(error).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('rejects tokens when Supabase Auth declines them', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'invalid JWT', code: 'bad_jwt' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const auth = createAuthService(
      loadConfig({
        NODE_ENV: 'test',
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_ANON_KEY: 'public-key',
      }),
    );
    await expect(auth.verify('self-signed-or-expired')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });
  });
});
