import { UnavailableProvider } from './unavailable.js';

export class GeminiProvider extends UnavailableProvider {
  constructor() {
    super('Gemini');
  }
}
