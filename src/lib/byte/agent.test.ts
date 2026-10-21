import { describe, expect, it } from 'vitest';
import { runAgent } from './agent';
import type { TokenUsage } from './cost';
import type { ToolOutcome } from './tools';
import type { ByteEvent } from './protocol';
import { Anthropic, scriptedModel } from './testing';

function setup(
  turns: Parameters<typeof scriptedModel>[0],
  runTool: (name: string, input: unknown) => Promise<ToolOutcome> = async () => ({ content: '{"ok":true}' }),
) {
  const model = scriptedModel(turns);
  const events: ByteEvent[] = [];
  const usage: TokenUsage[] = [];
  const logs: string[] = [];
  const run = (signal = new AbortController().signal) =>
    runAgent({
      createStream: model.createStream,
      params: { model: 'test', max_tokens: 100 },
      messages: [{ role: 'user', content: 'What has he built?' }],
      runTool,
      emit: (event) => events.push(event),
      onUsage: async (u) => void usage.push(u),
      signal,
      log: (message) => logs.push(message),
    });
  return { run, events, usage, logs, requests: model.requests };
}

const text = (events: ByteEvent[]) =>
  events
    .filter((e): e is Extract<ByteEvent, { type: 'text' }> => e.type === 'text')
    .map((e) => e.text)
    .join('');

describe('runAgent', () => {
  it('streams a plain answer and reports its usage', async () => {
    const { run, events, usage } = setup([{ text: ['Hel', 'lo!'], usage: { input_tokens: 10, output_tokens: 2 } }]);
    expect(await run()).toBe('done');
    expect(text(events)).toBe('Hello!');
    expect(usage).toEqual([expect.objectContaining({ input_tokens: 10, output_tokens: 2 })]);
  });

  it('runs requested tools, shows them, and sends every result back in one message', async () => {
    const calls: [string, unknown][] = [];
    const { run, events, requests, usage } = setup(
      [
        {
          text: ['Let me check.'],
          tools: [
            { id: 't1', name: 'get_github_repo', input: { name: 'reclaim' } },
            { id: 't2', name: 'get_recent_activity', input: {} },
          ],
        },
        { text: ['Reclaim is an Electron app.'] },
      ],
      async (name: string, input: unknown) => {
        calls.push([name, input]);
        return name === 'get_recent_activity' ? { content: 'down', isError: true } : { content: '{"repo":1}' };
      },
    );

    expect(await run()).toBe('done');
    expect(calls).toEqual([
      ['get_github_repo', { name: 'reclaim' }],
      ['get_recent_activity', {}],
    ]);
    expect(events.filter((e) => e.type === 'tool')).toEqual([
      { type: 'tool', name: 'get_github_repo', detail: 'reclaim' },
      { type: 'tool', name: 'get_recent_activity' },
    ]);
    // Text after the lookup starts a new paragraph.
    expect(text(events)).toBe('Let me check.\n\nReclaim is an Electron app.');
    expect(usage).toHaveLength(2);

    const followUp = requests[1]?.messages ?? [];
    expect(followUp).toHaveLength(3);
    expect(followUp[1]).toMatchObject({ role: 'assistant' });
    expect(followUp[2]).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 't1', content: '{"repo":1}' },
        { type: 'tool_result', tool_use_id: 't2', content: 'down', is_error: true },
      ],
    });
  });

  it('keeps earlier turns untouched (append-only history)', async () => {
    const { run, requests } = setup([
      { tools: [{ id: 't1', name: 'list_github_repos', input: {} }] },
      { tools: [{ id: 't2', name: 'get_github_repo', input: { name: 'x' } }] },
      { text: ['Done.'] },
    ]);
    await run();
    expect(requests[2]?.messages.slice(0, 3)).toEqual(requests[1]?.messages);
  });

  it('stops after the round limit', async () => {
    const lookup = { tools: [{ id: 't', name: 'list_github_repos', input: {} }] };
    const { run, requests } = setup([lookup, lookup, lookup, lookup, lookup, lookup]);
    expect(await run()).toBe('error');
    expect(requests).toHaveLength(5);
  });

  it('never runs a tool whose input was cut off', async () => {
    let ran = false;
    const { run } = setup(
      [{ text: ['Hm'], tools: [{ id: 't', name: 'get_post', input: { slug: 'how-i' } }], stop: 'max_tokens' }],
      async () => {
        ran = true;
        return { content: '' };
      },
    );
    expect(await run()).toBe('done');
    expect(ran).toBe(false);
  });

  it('reports refusals', async () => {
    const { run } = setup([{ stop: 'refusal' }]);
    expect(await run()).toBe('refusal');
  });

  it('treats an empty answer as an error', async () => {
    const { run } = setup([{ text: [] }]);
    expect(await run()).toBe('error');
  });

  it('maps upstream overload to "busy" and still counts the tokens used', async () => {
    const overloaded = new Anthropic.InternalServerError(
      529,
      { type: 'overloaded_error' },
      'Overloaded',
      new Headers(),
    );
    const { run, usage } = setup([{ text: ['Par'], error: overloaded }]);
    expect(await run()).toBe('busy');
    expect(usage).toHaveLength(1);
  });

  it('re-issues a round once when a tool input is unreadable and nothing was shown yet', async () => {
    const { run, requests, events } = setup([{ error: new SyntaxError('Unexpected end of JSON') }, { text: ['OK'] }]);
    expect(await run()).toBe('done');
    expect(requests).toHaveLength(2);
    expect(text(events)).toBe('OK');
  });

  it('stops quietly when the visitor aborts', async () => {
    const controller = new AbortController();
    controller.abort();
    const { run, requests } = setup([{ text: ['never'] }]);
    expect(await run(controller.signal)).toBe('aborted');
    expect(requests).toHaveLength(0);
  });
});
