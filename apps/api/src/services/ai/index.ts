import type { AppConfig } from '../../config/env.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { GeminiProvider } from './providers/gemini.js';
import { MockProvider } from './providers/mock.js';
import { OpenAIProvider } from './providers/openai.js';
import type { AiProvider } from './providers/types.js';

export function createProvider(config: AppConfig): AiProvider {
  if (config.aiProvider === 'openai' && config.openaiApiKey)
    return new OpenAIProvider(config.openaiApiKey, config.openaiModel, config.aiMaxOutputTokens);
  if (config.aiProvider === 'anthropic') return new AnthropicProvider();
  if (config.aiProvider === 'gemini') return new GeminiProvider();
  return new MockProvider(
    config.aiProvider === 'openai'
      ? 'AI not configured — demo response. OPENAI_API_KEY is missing.'
      : undefined,
  );
}
