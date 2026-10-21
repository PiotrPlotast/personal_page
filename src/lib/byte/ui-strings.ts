import { localizePath, type Locale } from '~/i18n/config';
import { useTranslations } from '~/i18n/ui';
import { TOOL_NAMES, type ByteErrorCode, type ToolName } from './protocol';

/** The chat's interface text, passed to the browser script as JSON on the chat element. */
export interface ChatStrings {
  thinking: string;
  stopped: string;
  you: string;
  byteSaid: string;
  /** `{detail}` is replaced with the project, post or repo name. */
  tools: Record<ToolName, string>;
  /** `{minutes}` is replaced for rate limits. May contain Markdown links. */
  errors: Record<ByteErrorCode | 'network', string>;
}

const ERROR_CODES = [
  'rate_limited',
  'budget',
  'verify',
  'unavailable',
  'busy',
  'refusal',
  'bad_request',
  'network',
] as const;

export function chatStrings(locale: Locale): ChatStrings {
  const t = useTranslations(locale);
  const contact = localizePath('/contact/', locale);
  return {
    thinking: t('chat.thinking'),
    stopped: t('chat.stopped'),
    you: t('chat.you'),
    byteSaid: t('chat.byteSaid'),
    tools: Object.fromEntries(TOOL_NAMES.map((name) => [name, t(`chat.tool.${name}`)])) as ChatStrings['tools'],
    errors: Object.fromEntries(
      ERROR_CODES.map((code) => [code, t(`chat.error.${code}`, { contact })]),
    ) as ChatStrings['errors'],
  };
}
