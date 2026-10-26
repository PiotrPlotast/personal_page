import { describe, expect, it } from 'vitest';
import { createOpenRouterStream } from './client';
import { MODEL } from './config';

const sse = (events: object[]) =>
  events.map((event) => `event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`).join('');

const answer = sse([
  {
    type: 'message_start',
    message: {
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: MODEL,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 12, output_tokens: 1 },
    },
  },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hi from OpenRouter' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } },
  { type: 'message_stop' },
]);

describe('createOpenRouterStream', () => {
  it("calls OpenRouter's Messages endpoint with the key as a bearer token", async () => {
    let request: Request | undefined;
    const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      request = new Request(input, init);
      return new Response(answer, { headers: { 'content-type': 'text/event-stream' } });
    }) as typeof fetch;

    const createStream = createOpenRouterStream({
      apiKey: 'sk-or-test',
      referer: 'https://piotr.dev',
      fetch: fakeFetch,
    });
    const stream = createStream(
      { model: MODEL, max_tokens: 100, messages: [{ role: 'user', content: 'Hi' }] },
      { signal: new AbortController().signal },
    );
    const message = await stream.finalMessage();

    expect(request?.url).toBe('https://openrouter.ai/api/v1/messages');
    expect(request?.headers.get('authorization')).toBe('Bearer sk-or-test');
    expect(request?.headers.get('x-api-key')).toBeNull();
    expect(request?.headers.get('http-referer')).toBe('https://piotr.dev');
    expect(request?.headers.get('x-title')).toBe('Byte - Piotr Plotast');
    expect(await request?.json()).toMatchObject({ model: 'anthropic/claude-haiku-5.5', stream: true });

    expect(message.content).toEqual([expect.objectContaining({ type: 'text', text: 'Hi from OpenRouter' })]);
    expect(message.usage).toMatchObject({ input_tokens: 12, output_tokens: 5 });
  });
});
