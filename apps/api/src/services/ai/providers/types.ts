export interface AiInput {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  context?: Record<string, unknown>;
}
export type AiChunk =
  { type: 'delta'; content: string } | { type: 'usage'; inputTokens: number; outputTokens: number };
export interface AiProvider {
  name: string;
  configured: boolean;
  mode: 'live' | 'demo' | 'unavailable';
  explanation?: string;
  stream(input: AiInput, signal: AbortSignal): AsyncIterable<AiChunk>;
}
