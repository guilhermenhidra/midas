import { AnthropicProvider } from './anthropic.js';
import { OpenRouterProvider } from './openrouter.js';
import { GroqProvider } from './groq.js';
import { GoogleProvider } from './google.js';
import { BonsaiProvider } from './bonsai.js';

export function createProvider(name, apiKey, model) {
  switch (name) {
    case 'anthropic':
      return new AnthropicProvider(apiKey, model);
    case 'openrouter':
      return new OpenRouterProvider(apiKey, model);
    case 'groq':
      return new GroqProvider(apiKey, model);
    case 'google':
      return new GoogleProvider(apiKey, model);
    case 'bonsai':
      return new BonsaiProvider(apiKey, model);
    default:
      throw new Error(`Provider desconhecido: ${name}`);
  }
}

export { AnthropicProvider, OpenRouterProvider, GroqProvider, GoogleProvider, BonsaiProvider };
