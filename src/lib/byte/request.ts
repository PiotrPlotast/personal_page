import { z } from 'astro/zod';
import { locales, type Locale } from '~/i18n/config';
import { INPUT_LIMITS } from './config';
import type { ChatTurn } from './protocol';

const schema = z.object({
  locale: z.enum(locales),
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string() }))
    .min(1)
    .max(100),
});

export interface ChatRequest {
  locale: Locale;
  messages: ChatTurn[];
}

/**
 * Validates what the browser sent and trims it to what the model gets: the latest
 * `maxHistory` turns, starting with a question and ending with the new one. Older answers are
 * shortened, the new question must fit the input limit. Returns null if the request is unusable.
 */
export function parseChatRequest(body: unknown, limits = INPUT_LIMITS): ChatRequest | null {
  const parsed = schema.safeParse(body);
  if (!parsed.success) return null;

  const turns: ChatTurn[] = [];
  for (const { role, text } of parsed.data.messages) {
    const trimmed = text.trim();
    if (!trimmed) continue;
    const previous = turns.at(-1);
    // The API merges consecutive turns from the same side anyway; doing it here keeps them alternating.
    if (previous?.role === role) previous.text += `\n\n${trimmed}`;
    else turns.push({ role, text: trimmed });
  }

  const question = turns.at(-1);
  if (question?.role !== 'user' || question.text.length > limits.questionChars) return null;

  let history = turns.slice(-limits.maxHistory);
  while (history[0]?.role === 'assistant') history = history.slice(1);

  return {
    locale: parsed.data.locale,
    messages: history.map(({ role, text }) => ({
      role,
      text: text.slice(0, role === 'user' ? limits.questionChars : limits.answerChars),
    })),
  };
}
