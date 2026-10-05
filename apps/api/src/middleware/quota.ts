import { createHmac } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RequestHandler } from 'express';
import type { AuthContext } from './auth.js';
import { AppError, asyncRoute, unwrap } from './errors.js';

export interface QuotaResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}
export interface QuotaStore {
  consume(
    subject: string,
    scope: string,
    limit: number,
    windowSeconds: number,
    cost?: number,
  ): Promise<QuotaResult>;
}

export class MemoryQuotaStore implements QuotaStore {
  private entries = new Map<string, { used: number; expires: number }>();
  constructor(
    private readonly clock = Date.now,
    private readonly maxEntries = 20000,
  ) {}
  async consume(
    subject: string,
    scope: string,
    limit: number,
    windowSeconds: number,
    cost = 1,
  ): Promise<QuotaResult> {
    const now = this.clock();
    const key = `${scope}:${subject}`;
    let entry = this.entries.get(key);
    if (!entry || entry.expires <= now) {
      if (this.entries.size >= this.maxEntries) {
        for (const [candidate, value] of this.entries)
          if (value.expires <= now) this.entries.delete(candidate);
        if (this.entries.size >= this.maxEntries)
          throw new AppError(
            503,
            'QUOTA_CAPACITY',
            'The server is at request capacity. Retry shortly.',
          );
      }
      entry = { used: 0, expires: now + windowSeconds * 1000 };
      this.entries.set(key, entry);
    }
    const allowed = entry.used + cost <= limit;
    if (allowed) entry.used += cost;
    return {
      allowed,
      remaining: Math.max(0, limit - entry.used),
      retryAfterSeconds: Math.max(1, Math.ceil((entry.expires - now) / 1000)),
    };
  }
}

export class PostgresQuotaStore implements QuotaStore {
  constructor(private readonly client: SupabaseClient) {}
  async consume(
    subject: string,
    scope: string,
    limit: number,
    windowSeconds: number,
    cost = 1,
  ): Promise<QuotaResult> {
    const rows = unwrap(
      await this.client.rpc('consume_api_quota', {
        p_subject: subject,
        p_scope: scope,
        p_limit: limit,
        p_window_seconds: windowSeconds,
        p_cost: cost,
      }),
    ) as Array<{ allowed: boolean; remaining: number; retry_after_seconds: number }>;
    const row = rows[0];
    if (!row)
      throw new AppError(
        503,
        'QUOTA_UNAVAILABLE',
        'Request accounting is unavailable. Retry shortly.',
      );
    return {
      allowed: row.allowed,
      remaining: Number(row.remaining),
      retryAfterSeconds: row.retry_after_seconds,
    };
  }
}

export function limitRequests(
  store: QuotaStore,
  secret: string,
  scope: string,
  limit: number,
  windowSeconds: number,
): RequestHandler {
  return asyncRoute(async (request, response, next) => {
    const user = response.locals.auth as AuthContext | undefined;
    const identity = user
      ? `user:${user.userId}`
      : `ip:${request.ip ?? request.socket.remoteAddress ?? 'unknown'}`;
    const subject = createHmac('sha256', secret).update(identity).digest('hex');
    const result = await store.consume(subject, scope, limit, windowSeconds);
    response.setHeader('RateLimit-Limit', String(limit));
    response.setHeader('RateLimit-Remaining', String(result.remaining));
    response.setHeader('RateLimit-Reset', String(result.retryAfterSeconds));
    if (!result.allowed) {
      response.setHeader('Retry-After', String(result.retryAfterSeconds));
      throw new AppError(
        429,
        'RATE_LIMITED',
        'The request limit has been reached. Retry after the indicated interval.',
      );
    }
    next();
  });
}
