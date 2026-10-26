/**
 * What the browser and /api/chat say to each other. Shared by both sides, so it must stay free of
 * server-only imports.
 *
 * Request: POST JSON `{ locale, messages: [{ role, text }, …] }`, last message from the user.
 * Response: a stream of `data: <json>\n\n` events (Server-Sent Events framing over a POST), or a
 * JSON `{ error, retryAfter? }` with a 4xx/5xx status when the question is refused up front.
 */

export type ChatRole = 'user' | 'assistant';

export interface ChatTurn {
  role: ChatRole;
  text: string;
}

export const TOOL_NAMES = [
  'get_project',
  'get_post',
  'list_github_repos',
  'get_github_repo',
  'get_recent_activity',
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export type ByteErrorCode =
  /** Too many questions from this visitor; try again in `retryAfter` seconds. */
  | 'rate_limited'
  /** The monthly or daily spending cap is used up. */
  | 'budget'
  /** The bot check failed or is missing. */
  | 'verify'
  /** Byte isn't configured, or something broke on our side. */
  | 'unavailable'
  /** The model is overloaded or rate limited upstream. */
  | 'busy'
  /** The model declined to answer. */
  | 'refusal'
  /** The request itself was malformed. */
  | 'bad_request';

export type ByteEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: ToolName; detail?: string }
  | { type: 'done' }
  | { type: 'error'; code: ByteErrorCode };

export interface ErrorBody {
  error: ByteErrorCode;
  retryAfter?: number;
}

export const encodeEvent = (event: ByteEvent) => `data: ${JSON.stringify(event)}\n\n`;

/** Feeds raw stream chunks in, calls `onEvent` for every complete event. Partial events are buffered. */
export function createEventParser(onEvent: (event: ByteEvent) => void) {
  let buffer = '';
  return (chunk: string) => {
    buffer += chunk;
    let boundary: number;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6))
        .join('\n');
      if (!data) continue;
      try {
        onEvent(JSON.parse(data) as ByteEvent);
      } catch {
        // A malformed frame is skipped rather than ending the whole answer.
      }
    }
  };
}
