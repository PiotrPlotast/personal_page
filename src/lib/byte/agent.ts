import Anthropic from '@anthropic-ai/sdk';
import { MAX_ROUNDS } from './config';
import type { TokenUsage } from './cost';
import type { ByteEvent } from './protocol';
import { isToolName, toolDetail, type ToolOutcome } from './tools';

/** The parts of the SDK's MessageStream the loop uses, so tests can script a fake one. */
export interface StreamLike extends AsyncIterable<Anthropic.MessageStreamEvent> {
  finalMessage(): Promise<Anthropic.Message>;
  readonly currentMessage: Anthropic.Message | undefined;
}

export type CreateStream = (params: Anthropic.MessageStreamParams, options: { signal: AbortSignal }) => StreamLike;

export type AgentOutcome = 'done' | 'refusal' | 'aborted' | 'busy' | 'budget' | 'error';

export interface AgentOptions {
  createStream: CreateStream;
  params: Omit<Anthropic.MessageStreamParams, 'messages'>;
  messages: Anthropic.MessageParam[];
  runTool: (name: string, input: unknown) => Promise<ToolOutcome>;
  emit: (event: ByteEvent) => void;
  onUsage: (usage: TokenUsage) => Promise<void>;
  signal: AbortSignal;
  maxRounds?: number;
  log?: (message: string, error?: unknown) => void;
}

/**
 * The streaming tool-use loop: stream an answer, and whenever Claude asks for tools, run them,
 * append the results and stream the next round. Text is forwarded as it arrives; every call's
 * token usage is reported (even for aborted calls) so the budget stays accurate.
 */
export async function runAgent(options: AgentOptions): Promise<AgentOutcome> {
  const { createStream, params, runTool, emit, onUsage, signal, log = console.error } = options;
  const maxRounds = options.maxRounds ?? MAX_ROUNDS;
  // Append-only: earlier turns are never edited, which keeps replayed thinking blocks valid.
  const messages = [...options.messages];
  let wroteText = false;
  let parseRetries = 0;

  for (let round = 0; round < maxRounds; round++) {
    if (signal.aborted) return 'aborted';
    // Text after a tool lookup starts a new paragraph instead of running into the earlier text.
    let needsBreak = wroteText;
    let roundText = false;
    const stream = createStream({ ...params, messages }, { signal });

    let message: Anthropic.Message;
    try {
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta' && event.delta.text) {
          if (needsBreak) emit({ type: 'text', text: '\n\n' });
          needsBreak = false;
          emit({ type: 'text', text: event.delta.text });
          wroteText = roundText = true;
        }
      }
      message = await stream.finalMessage();
    } catch (error) {
      const partial = stream.currentMessage?.usage;
      if (partial) await onUsage(partial);
      if (signal.aborted || error instanceof Anthropic.APIUserAbortError) return 'aborted';
      if (
        error instanceof Anthropic.RateLimitError ||
        error instanceof Anthropic.InternalServerError ||
        error instanceof Anthropic.APIConnectionError
      ) {
        log('Byte: Claude is busy or unreachable', error);
        return 'busy';
      }
      // OpenRouter answers 402 when the key's credit runs out: the hard spending cap.
      if (error instanceof Anthropic.APIError && error.status === 402) {
        log('Byte: out of OpenRouter credit', error);
        return 'budget';
      }
      if (error instanceof Anthropic.APIError) {
        log('Byte: Claude API error', error);
        return 'error';
      }
      // A streamed tool input that isn't parseable JSON: re-issue the round once, unless the
      // visitor already saw text from it (repeating that would duplicate the answer).
      if (!roundText && parseRetries++ < 1) {
        round--;
        continue;
      }
      log('Byte: unreadable model response', error);
      return 'error';
    }

    await onUsage(message.usage);
    if (message.stop_reason === 'refusal') return 'refusal';

    const toolUses = message.content.filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');
    // Anything but a complete tool request ends the answer. A tool input cut off at max_tokens is
    // never run.
    if (message.stop_reason !== 'tool_use' || toolUses.length === 0) return wroteText ? 'done' : 'error';

    messages.push({ role: 'assistant', content: message.content });
    const results = await Promise.all(
      toolUses.map(async (block): Promise<Anthropic.ToolResultBlockParam> => {
        if (isToolName(block.name)) {
          const detail = toolDetail(block.name, block.input);
          emit({ type: 'tool', name: block.name, ...(detail ? { detail } : {}) });
        }
        let outcome: ToolOutcome;
        try {
          outcome = await runTool(block.name, block.input);
        } catch (error) {
          log(`Byte: tool ${block.name} failed`, error);
          outcome = { content: 'This lookup failed. Answer from what you already know.', isError: true };
        }
        return {
          type: 'tool_result',
          tool_use_id: block.id,
          content: outcome.content,
          ...(outcome.isError ? { is_error: true } : {}),
        };
      }),
    );
    // All results go back in one message, which keeps parallel tool calls working well.
    messages.push({ role: 'user', content: results });
  }

  return wroteText ? 'done' : 'error';
}
