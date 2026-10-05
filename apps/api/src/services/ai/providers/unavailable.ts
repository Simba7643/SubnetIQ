import { AppError } from '../../../middleware/errors.js';
import type { AiChunk, AiInput, AiProvider } from './types.js';

export class UnavailableProvider implements AiProvider {
  readonly configured = false;
  readonly mode = 'unavailable' as const;
  readonly explanation: string;
  constructor(readonly name: string) {
    this.explanation = `${name} integration is not implemented. Adding a key does not enable it.`;
  }
  stream(_input: AiInput, _signal: AbortSignal): AsyncIterable<AiChunk> {
    const failure = new AppError(501, 'PROVIDER_NOT_IMPLEMENTED', this.explanation);
    return {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<AiChunk>> {
            throw failure;
          },
        };
      },
    };
  }
}
