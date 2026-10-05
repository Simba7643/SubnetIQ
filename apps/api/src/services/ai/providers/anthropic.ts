import { UnavailableProvider } from './unavailable.js';

export class AnthropicProvider extends UnavailableProvider {
  constructor() {
    super('Anthropic');
  }
}
