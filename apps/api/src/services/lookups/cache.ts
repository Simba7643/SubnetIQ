import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../../middleware/errors.js';

export interface LookupCache {
  get<T>(key: string): Promise<T | null>;
  set(key: string, kind: string, value: unknown, ttlSeconds: number): Promise<void>;
}

export class MemoryLookupCache implements LookupCache {
  private entries = new Map<string, { value: unknown; expiresAt: number }>();
  constructor(
    private readonly clock = Date.now,
    private readonly capacity = 2000,
  ) {}
  async get<T>(key: string): Promise<T | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.clock()) {
      this.entries.delete(key);
      return null;
    }
    return structuredClone(entry.value) as T;
  }
  async set(key: string, _kind: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return;
    if (this.entries.size >= this.capacity) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest) this.entries.delete(oldest);
    }
    this.entries.set(key, {
      value: structuredClone(value),
      expiresAt: this.clock() + ttlSeconds * 1000,
    });
  }
}

export class PostgresLookupCache implements LookupCache {
  constructor(private readonly client: SupabaseClient) {}
  async get<T>(key: string): Promise<T | null> {
    const { data, error } = await this.client.rpc('get_lookup_cache', { p_key: key });
    if (error)
      throw new AppError(
        503,
        'CACHE_UNAVAILABLE',
        'The shared lookup cache is unavailable. Check migrations and retry.',
      );
    return data as T | null;
  }
  async set(key: string, kind: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return;
    const { error } = await this.client.rpc('put_lookup_cache', {
      p_key: key,
      p_kind: kind,
      p_value: value,
      p_ttl_seconds: ttlSeconds,
    });
    if (error)
      throw new AppError(
        503,
        'CACHE_UNAVAILABLE',
        'The shared lookup cache is unavailable. Check migrations and retry.',
      );
  }
}
