import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { RequestHandler, Response } from 'express';
import type { AppConfig } from '../config/env.js';
import { AppError, asyncRoute } from './errors.js';

export interface AuthContext {
  userId: string;
  email?: string;
  accessToken: string;
  client: SupabaseClient;
}

export interface AuthService {
  configured: boolean;
  verify(token: string): Promise<AuthContext>;
  service?: SupabaseClient;
}

const boundedFetch: typeof fetch = (input, options) => {
  const signals = [AbortSignal.timeout(10000), ...(options?.signal ? [options.signal] : [])];
  return fetch(input, { ...options, signal: AbortSignal.any(signals) });
};
const clientOptions = {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  global: { fetch: boundedFetch },
};

export function createAuthService(config: AppConfig): AuthService {
  const configured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
  const publicClient = configured
    ? createClient(config.supabaseUrl!, config.supabaseAnonKey!, clientOptions)
    : undefined;
  const service =
    config.supabaseUrl && config.supabaseServiceRoleKey
      ? createClient(config.supabaseUrl, config.supabaseServiceRoleKey, clientOptions)
      : undefined;
  return {
    configured,
    service,
    async verify(token) {
      if (!publicClient)
        throw new AppError(
          503,
          'SERVICE_UNAVAILABLE',
          'Account features require Supabase configuration. Guest calculators and reference tools remain available.',
        );
      const { data, error } = await publicClient.auth.getUser(token);
      if (error && (!error.status || error.status >= 500))
        throw new AppError(
          503,
          'AUTH_UNAVAILABLE',
          'The authentication service could not verify your session. Retry shortly.',
        );
      if (error || !data.user)
        throw new AppError(
          401,
          'UNAUTHORIZED',
          'Your session is invalid or expired. Sign in again.',
        );
      return {
        userId: data.user.id,
        email: data.user.email,
        accessToken: token,
        client: createClient(config.supabaseUrl!, config.supabaseAnonKey!, {
          ...clientOptions,
          global: { ...clientOptions.global, headers: { Authorization: `Bearer ${token}` } },
        }),
      };
    },
  };
}

export function authenticate(auth: AuthService, required: boolean): RequestHandler {
  return asyncRoute(async (request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    const authorization = request.headers.authorization;
    if (!auth.configured) {
      if (required || authorization)
        throw new AppError(
          503,
          'SERVICE_UNAVAILABLE',
          'Account features require SUPABASE_URL and SUPABASE_ANON_KEY. Use the guest tools while the deployment is configured.',
        );
      next();
      return;
    }
    if (!authorization) {
      if (required) throw new AppError(401, 'UNAUTHORIZED', 'Sign in to access saved work.');
      next();
      return;
    }
    const matched = /^Bearer ([A-Za-z0-9._~-]{20,8192})$/.exec(authorization);
    if (!matched) throw new AppError(401, 'UNAUTHORIZED', 'Send a valid Bearer access token.');
    response.locals.auth = await auth.verify(matched[1]!);
    next();
  });
}

export function authContext(response: Response): AuthContext {
  const context = response.locals.auth as AuthContext | undefined;
  if (!context) throw new AppError(401, 'UNAUTHORIZED', 'Sign in to access this feature.');
  return context;
}

export function requireService(auth: AuthService): SupabaseClient {
  if (!auth.service)
    throw new AppError(
      503,
      'SERVICE_UNAVAILABLE',
      'This operation requires the server-side Supabase service key and applied migrations.',
    );
  return auth.service;
}
