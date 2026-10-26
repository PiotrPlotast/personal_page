import Anthropic from '@anthropic-ai/sdk';
import type { CreateStream } from './agent';
import { OPENROUTER } from './config';

/**
 * The model connection: the Anthropic SDK pointed at OpenRouter's Anthropic-compatible endpoint.
 * OpenRouter takes its key as a bearer token, so it goes in `authToken` and `apiKey` stays empty
 * (otherwise the SDK would also send an ANTHROPIC_API_KEY from the environment).
 */
export function createOpenRouterStream(options: {
  apiKey: string;
  /** The site's URL, which OpenRouter shows as the app's homepage. */
  referer?: string | undefined;
  fetch?: typeof fetch;
}): CreateStream {
  const client = new Anthropic({
    baseURL: OPENROUTER.baseURL,
    apiKey: null,
    authToken: options.apiKey,
    defaultHeaders: {
      'X-Title': OPENROUTER.appName,
      ...(options.referer ? { 'HTTP-Referer': options.referer } : {}),
    },
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  return (params, { signal }) => client.messages.stream(params, { signal });
}
