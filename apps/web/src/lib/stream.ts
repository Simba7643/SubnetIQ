export interface StreamEvent {
  type: 'meta' | 'delta' | 'done' | 'error';
  content?: string;
  message?: string;
  mode?: string;
  provider?: string;
  conversationId?: string;
  persisted?: boolean;
}
export async function readEventStream(response: Response, onEvent: (event: StreamEvent) => void) {
  if (!response.body) throw new Error('This browser did not receive a response stream.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let terminal = false;
  const dispatch = (frame: string) => {
    const data = frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data) return;
    if (data === '[DONE]') {
      terminal = true;
      return;
    }
    let event: StreamEvent;
    try {
      event = JSON.parse(data) as StreamEvent;
    } catch {
      throw new Error('The assistant returned an invalid stream event.');
    }
    if (!['meta', 'delta', 'done', 'error'].includes(event.type)) return;
    if (event.type === 'delta' && typeof event.content !== 'string')
      throw new Error('The assistant returned an invalid text fragment.');
    if (event.type === 'done' || event.type === 'error') terminal = true;
    onEvent(event);
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      buffer = buffer.replaceAll('\r\n', '\n');
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        dispatch(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
      }
      if (buffer.length > 200000) throw new Error('The response event is too large.');
      if (done) {
        if (buffer.trim()) dispatch(buffer);
        if (!terminal)
          throw new Error(
            'The connection ended before the response completed. Retry the question to continue.',
          );
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
