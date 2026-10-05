import { describe, expect, it, jest } from '@jest/globals';
import { OpenAIProvider, readSse } from '../src/services/ai/providers/openai.js';
import { MockProvider } from '../src/services/ai/providers/mock.js';
import { AnthropicProvider } from '../src/services/ai/providers/anthropic.js';
import { loadConfig } from '../src/config/env.js';
import { createProvider } from '../src/services/ai/index.js';
import type { AiChunk } from '../src/services/ai/providers/types.js';

function streamText(parts: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(new TextEncoder().encode(part));
      controller.close();
    },
  });
}

describe('OpenAI Responses streaming adapter', () => {
  it('streams deltas and actual provider usage with storage disabled', async () => {
    const payload = [
      'data: {"type":"response.output_text.delta","delta":"Network "}\n\n',
      'data: {"type":"response.output_text.delta","delta":"explained"}\n\n',
      'data: {"type":"response.completed","response":{"usage":{"input_tokens":18,"output_tokens":5}}}\n\n',
    ];
    const transport = jest
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(streamText(payload), { status: 200 }));
    const provider = new OpenAIProvider('secret-test-only', 'test-model', 1200, transport);
    const output: AiChunk[] = [];
    for await (const chunk of provider.stream(
      { messages: [{ role: 'user', content: 'Explain /24' }] },
      new AbortController().signal,
    ))
      output.push(chunk);
    expect(output).toEqual([
      { type: 'delta', content: 'Network ' },
      { type: 'delta', content: 'explained' },
      { type: 'usage', inputTokens: 18, outputTokens: 5 },
    ]);
    const [url, options] = transport.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(options?.redirect).toBe('error');
    expect(JSON.parse(options?.body as string)).toMatchObject({
      stream: true,
      store: false,
      max_output_tokens: 1200,
      model: 'test-model',
    });
  });
  it('parses SSE events split across byte boundaries and CRLF lines', async () => {
    const events = [];
    for await (const event of readSse(
      streamText([
        'data: {"type":"response.output_text.',
        'delta","delta":"hello"}\r',
        '\n\r\n',
        'data: [DONE]\n\n',
      ]),
      new AbortController().signal,
    ))
      events.push(event);
    expect(events).toEqual([{ type: 'response.output_text.delta', delta: 'hello' }]);
  });
  it('reports provider authentication failures without exposing provider bodies or keys', async () => {
    const transport = jest
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('private provider details', { status: 401 }));
    const stream = new OpenAIProvider('never-expose-this', 'test', 1000, transport).stream(
      { messages: [{ role: 'user', content: 'test' }] },
      new AbortController().signal,
    );
    const generator = stream[Symbol.asyncIterator]();
    await expect(generator.next()).rejects.toMatchObject({ code: 'AI_CONFIGURATION_ERROR' });
  });
  it('treats a stream without completion as interrupted', async () => {
    const transport = jest
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          streamText(['data: {"type":"response.output_text.delta","delta":"partial"}\n\n']),
        ),
      );
    const stream = new OpenAIProvider('key', 'test', 1000, transport).stream(
      { messages: [{ role: 'user', content: 'test' }] },
      new AbortController().signal,
    );
    const generator = stream[Symbol.asyncIterator]();
    expect(await generator.next()).toMatchObject({ value: { type: 'delta', content: 'partial' } });
    await expect(generator.next()).rejects.toMatchObject({ code: 'AI_STREAM_INTERRUPTED' });
  });
  it('never enables unsupported providers simply because a key exists', () => {
    const provider = createProvider(
      loadConfig({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'test-key' }),
    );
    expect(provider).toBeInstanceOf(AnthropicProvider);
    expect(provider.configured).toBe(false);
    expect(provider.mode).toBe('unavailable');
  });
  it('honors cancellation before producing mock output', async () => {
    const controller = new AbortController();
    controller.abort();
    const stream = new MockProvider().stream(
      { messages: [{ role: 'user', content: 'hello' }] },
      controller.signal,
    );
    const generator = stream[Symbol.asyncIterator]();
    await expect(generator.next()).rejects.toThrow();
  });
});

describe('environment checks', () => {
  it('requires both public Supabase fields together', () => {
    expect(() => loadConfig({ SUPABASE_URL: 'https://project.supabase.co' })).toThrow('together');
  });
  it('requires atomic production quotas and stable request identity hashing', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', QUOTA_STORE: 'memory' })).toThrow(
      'atomic quotas',
    );
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_ANON_KEY: 'key',
        SUPABASE_SERVICE_ROLE_KEY: 'secret',
      }),
    ).toThrow('RATE_LIMIT_SECRET');
  });
});
