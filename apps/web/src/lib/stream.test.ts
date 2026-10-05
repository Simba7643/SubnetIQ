import { describe, expect, it } from 'vitest';
import { readEventStream, type StreamEvent } from './stream';

function response(parts: string[]) {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const part of parts) controller.enqueue(new TextEncoder().encode(part));
        controller.close();
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
}

describe('assistant event stream', () => {
  it('reassembles split CRLF frames and requires an explicit completion event', async () => {
    const events: StreamEvent[] = [];
    await readEventStream(
      response([
        'data: {"type":"meta","mode":"demo"}\r',
        '\n\r',
        '\ndata: {"type":"delta","content":"prefix"}\n\n',
        'data: {"type":"done"}\n\n',
      ]),
      (event) => events.push(event),
    );
    expect(events.map((event) => event.type)).toEqual(['meta', 'delta', 'done']);
    expect(events[1].content).toBe('prefix');
  });

  it('reports a connection that ends after partial text', async () => {
    const events: StreamEvent[] = [];
    await expect(
      readEventStream(response(['data: {"type":"delta","content":"partial"}\n\n']), (event) =>
        events.push(event),
      ),
    ).rejects.toThrow('before the response completed');
    expect(events[0].content).toBe('partial');
  });

  it('preserves structured server errors as terminal events', async () => {
    const events: StreamEvent[] = [];
    await readEventStream(
      response(['data: {"type":"error","message":"The response could not be saved."}\n\n']),
      (event) => events.push(event),
    );
    expect(events).toEqual([{ type: 'error', message: 'The response could not be saved.' }]);
  });

  it('rejects malformed data and non-text deltas', async () => {
    await expect(readEventStream(response(['data: {bad}\n\n']), () => undefined)).rejects.toThrow(
      'invalid stream event',
    );
    await expect(
      readEventStream(response(['data: {"type":"delta","content":123}\n\n']), () => undefined),
    ).rejects.toThrow('invalid text fragment');
  });
});
