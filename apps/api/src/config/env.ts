import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);
const optionalSecret = z.preprocess(emptyToUndefined, z.string().min(1).optional());
const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default('0.0.0.0'),
  WEB_ORIGINS: z.string().default('http://localhost:5173'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  SUPABASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  SUPABASE_ANON_KEY: optionalSecret,
  SUPABASE_SERVICE_ROLE_KEY: optionalSecret,
  AI_PROVIDER: z.enum(['mock', 'openai', 'anthropic', 'gemini']).default('mock'),
  OPENAI_API_KEY: optionalSecret,
  OPENAI_MODEL: z.string().min(1).max(100).default('gpt-4.1-mini'),
  ANTHROPIC_API_KEY: optionalSecret,
  GEMINI_API_KEY: optionalSecret,
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(128).max(4096).default(1200),
  AI_DAILY_LIMIT: z.coerce.number().int().min(1).max(1000).default(30),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(180000).default(60000),
  LOOKUP_TIMEOUT_MS: z.coerce.number().int().min(1000).max(15000).default(7000),
  LOOKUP_MAX_CONCURRENT: z.coerce.number().int().min(1).max(32).default(8),
  WHOIS_FALLBACK_ENABLED: z.enum(['true', 'false']).default('false'),
  QUOTA_STORE: z.preprocess(emptyToUndefined, z.enum(['memory', 'postgres']).optional()),
  RATE_LIMIT_SECRET: optionalSecret,
  LOG_LEVEL: z.enum(['silent', 'error', 'info']).default('info'),
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  host: string;
  webOrigins: string[];
  trustProxyHops: number;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseServiceRoleKey?: string;
  aiProvider: 'mock' | 'openai' | 'anthropic' | 'gemini';
  openaiApiKey?: string;
  openaiModel: string;
  aiMaxOutputTokens: number;
  aiDailyLimit: number;
  aiTimeoutMs: number;
  lookupTimeoutMs: number;
  lookupMaxConcurrent: number;
  whoisFallbackEnabled: boolean;
  quotaStore: 'memory' | 'postgres';
  rateLimitSecret: string;
  logLevel: 'silent' | 'error' | 'info';
}

export function loadConfig(
  environment: Record<string, string | undefined> = process.env,
): AppConfig {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid environment settings: ${names.join(', ')}. See docs/environment.md.`);
  }
  const env = parsed.data;
  const webOrigins = env.WEB_ORIGINS.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    webOrigins.length === 0 ||
    webOrigins.some((origin) => {
      try {
        const url = new URL(origin);
        return (
          !['http:', 'https:'].includes(url.protocol) ||
          url.origin !== origin ||
          url.username !== '' ||
          url.password !== ''
        );
      } catch {
        return true;
      }
    })
  )
    throw new Error(
      'WEB_ORIGINS must contain comma-separated, complete HTTP(S) origins without paths.',
    );
  if (Boolean(env.SUPABASE_URL) !== Boolean(env.SUPABASE_ANON_KEY)) {
    throw new Error(
      'Set SUPABASE_URL and SUPABASE_ANON_KEY together, or leave both empty for guest mode.',
    );
  }
  if (env.SUPABASE_SERVICE_ROLE_KEY && !env.SUPABASE_URL)
    throw new Error('SUPABASE_SERVICE_ROLE_KEY requires Supabase configuration.');
  const quotaStore = env.QUOTA_STORE ?? (env.NODE_ENV === 'production' ? 'postgres' : 'memory');
  if (quotaStore === 'postgres' && !env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error('PostgreSQL quotas require SUPABASE_SERVICE_ROLE_KEY and applied migrations.');
  if (env.NODE_ENV === 'production') {
    if (quotaStore !== 'postgres')
      throw new Error(
        'Production requires QUOTA_STORE=postgres for atomic quotas across API instances.',
      );
    if (!env.RATE_LIMIT_SECRET || env.RATE_LIMIT_SECRET.length < 32)
      throw new Error('Production requires a RATE_LIMIT_SECRET of at least 32 characters.');
    if (webOrigins.some((origin) => !origin.startsWith('https://')))
      throw new Error('Production WEB_ORIGINS must use HTTPS.');
    if (env.SUPABASE_URL && !env.SUPABASE_URL.startsWith('https://'))
      throw new Error('Production Supabase must use HTTPS.');
  }
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    host: env.HOST,
    webOrigins,
    trustProxyHops: env.TRUST_PROXY_HOPS,
    supabaseUrl: env.SUPABASE_URL,
    supabaseAnonKey: env.SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    aiProvider: env.AI_PROVIDER,
    openaiApiKey: env.OPENAI_API_KEY,
    openaiModel: env.OPENAI_MODEL,
    aiMaxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
    aiDailyLimit: env.AI_DAILY_LIMIT,
    aiTimeoutMs: env.AI_TIMEOUT_MS,
    lookupTimeoutMs: env.LOOKUP_TIMEOUT_MS,
    lookupMaxConcurrent: env.LOOKUP_MAX_CONCURRENT,
    whoisFallbackEnabled: env.WHOIS_FALLBACK_ENABLED === 'true',
    quotaStore,
    rateLimitSecret: env.RATE_LIMIT_SECRET ?? randomBytes(32).toString('hex'),
    logLevel: env.LOG_LEVEL,
  };
}
