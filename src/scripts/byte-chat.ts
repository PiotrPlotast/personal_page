/**
 * The chat in the browser: sends questions to /api/chat, streams Byte's answer into the log,
 * keeps the conversation in localStorage (shared by the home tile and the floating chat), and
 * handles Stop, Clear and the Turnstile bot check. Markup contract: see ChatBody.astro.
 */
import { PUBLIC_TURNSTILE_SITE_KEY } from 'astro:env/client';
import { parseMarkdown, toPlainText, type Block, type Inline } from '~/lib/byte/markdown';
import { createEventParser, type ByteErrorCode, type ChatTurn, type ErrorBody } from '~/lib/byte/protocol';
import type { ChatStrings } from '~/lib/byte/ui-strings';

const STORAGE_KEY = 'byte:conversation';
const VERIFIED_KEY = 'byte:verified';
const MAX_STORED = 30;
const MAX_SENT = 12;

function loadHistory(): ChatTurn[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter(
          (turn): turn is ChatTurn =>
            (turn?.role === 'user' || turn?.role === 'assistant') && typeof turn?.text === 'string',
        )
      : [];
  } catch {
    return [];
  }
}

function saveHistory(history: ChatTurn[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_STORED)));
  } catch {
    // Private mode or storage full: the chat still works, it just won't survive a reload.
  }
}

const session = {
  verified: () => {
    try {
      return sessionStorage.getItem(VERIFIED_KEY) === '1';
    } catch {
      return false;
    }
  },
  setVerified: (value: boolean) => {
    try {
      if (value) sessionStorage.setItem(VERIFIED_KEY, '1');
      else sessionStorage.removeItem(VERIFIED_KEY);
    } catch {
      // Without storage we simply verify again next time.
    }
  },
};

// --- Turnstile (Cloudflare's invisible bot check), loaded only when a question is first sent ---

interface Turnstile {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  remove(id: string): void;
}

let turnstileScript: Promise<Turnstile> | undefined;

function loadTurnstile(): Promise<Turnstile> {
  turnstileScript ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => {
      const turnstile = (window as unknown as { turnstile?: Turnstile }).turnstile;
      if (turnstile) resolve(turnstile);
      else reject(new Error('Turnstile missing'));
    };
    script.onerror = () => {
      turnstileScript = undefined;
      reject(new Error('Turnstile failed to load'));
    };
    document.head.append(script);
  });
  return turnstileScript;
}

async function turnstileToken(container: HTMLElement, siteKey: string, language: string): Promise<string> {
  const turnstile = await loadTurnstile();
  return new Promise((resolve, reject) => {
    let id = '';
    const finish = (settle: () => void) => {
      settle();
      // Tokens are single-use; a fresh widget is rendered for the next check.
      queueMicrotask(() => turnstile.remove(id));
    };
    id = turnstile.render(container, {
      sitekey: siteKey,
      // Invisible unless Cloudflare needs the visitor to click something.
      appearance: 'interaction-only',
      language,
      callback: (token: string) => finish(() => resolve(token)),
      'error-callback': () => finish(() => reject(new Error('Turnstile error'))),
      'expired-callback': () => finish(() => reject(new Error('Turnstile expired'))),
    });
  });
}

// --- Rendering Byte's Markdown with DOM methods (never innerHTML) ---

function renderInline(parent: HTMLElement, nodes: Inline[]) {
  for (const node of nodes) {
    if (node.type === 'text') parent.append(node.text);
    else if (node.type === 'code') {
      const code = document.createElement('code');
      code.className = 'rounded bg-ink px-1 py-0.5 text-[0.9em]';
      code.textContent = node.text;
      parent.append(code);
    } else if (node.type === 'link') {
      const link = document.createElement('a');
      link.href = node.href;
      link.className = 'font-semibold text-lime underline underline-offset-2';
      renderInline(link, node.children);
      parent.append(link);
    } else {
      const element = document.createElement(node.type === 'strong' ? 'strong' : 'em');
      renderInline(element, node.children);
      parent.append(element);
    }
  }
}

function renderBlocks(container: HTMLElement, blocks: Block[]) {
  container.replaceChildren(
    ...blocks.map((block) => {
      if (block.type === 'p') {
        const p = document.createElement('p');
        p.className = 'whitespace-pre-line';
        renderInline(p, block.children);
        return p;
      }
      const list = document.createElement(block.type);
      list.className = `${block.type === 'ul' ? 'list-disc' : 'list-decimal'} space-y-1 pl-5`;
      for (const item of block.items) {
        const li = document.createElement('li');
        renderInline(li, item);
        list.append(li);
      }
      return list;
    }),
  );
}

// --- The chat ---

export interface ByteChat {
  ask(question: string): void;
}

export function mountByteChat(root: HTMLElement, hooks: { onActivity?: () => void } = {}): ByteChat | undefined {
  const log = root.querySelector<HTMLElement>('[data-byte-log]');
  const live = root.querySelector<HTMLElement>('[data-byte-live]');
  const form = root.querySelector<HTMLFormElement>('[data-byte-form]');
  const input = form?.querySelector<HTMLInputElement>('input');
  const sendButton = root.querySelector<HTMLButtonElement>('[data-byte-send]');
  const stopButton = root.querySelector<HTMLButtonElement>('[data-byte-stop]');
  const turnstileBox = root.querySelector<HTMLElement>('[data-byte-turnstile]');
  if (!log || !live || !form || !input || !sendButton || !stopButton || !turnstileBox) return undefined;

  const strings = JSON.parse(root.dataset['strings'] ?? '{}') as ChatStrings;
  const language = document.documentElement.lang || 'en';
  const locale = language.startsWith('pl') ? 'pl' : 'en';
  const suggestions = root.querySelector<HTMLElement>('[data-byte-suggestions]');
  const clearButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-byte-clear]')];

  let history = loadHistory();
  let controller: AbortController | null = null;
  // Bumped by Clear, so an answer still finishing for the old conversation is dropped.
  let generation = 0;

  const announce = (text: string) => {
    // Clearing first makes screen readers announce a repeated message again.
    live.textContent = '';
    window.setTimeout(() => (live.textContent = text), 50);
  };

  const nearBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  const scrollDown = () => (log.scrollTop = log.scrollHeight);

  const updateChrome = () => {
    const busy = controller !== null;
    sendButton.hidden = busy;
    stopButton.hidden = !busy;
    if (suggestions) suggestions.hidden = history.length > 0 || busy;
    for (const button of clearButtons) button.hidden = history.length === 0 && !busy;
  };

  const userBubble = (text: string) => {
    const bubble = document.createElement('div');
    bubble.dataset['byteTurn'] = 'user';
    bubble.className =
      'max-w-[85%] self-end rounded-[18px_18px_6px_18px] bg-lime px-4 py-2.5 font-medium wrap-break-word whitespace-pre-line text-on-lime';
    const who = document.createElement('span');
    who.className = 'sr-only';
    who.textContent = `${strings.you} `;
    bubble.append(who, text);
    log.append(bubble);
  };

  const byteBubble = () => {
    const bubble = document.createElement('div');
    bubble.dataset['byteTurn'] = 'assistant';
    bubble.className =
      'flex max-w-[92%] flex-col gap-2 rounded-[18px_18px_18px_6px] bg-ink-raise px-4 py-3 wrap-break-word';
    const who = document.createElement('span');
    who.className = 'sr-only';
    who.textContent = `${strings.byteSaid} `;
    const tools = document.createElement('ul');
    tools.className = 'flex flex-col gap-1 text-sm text-ink-muted empty:hidden';
    const body = document.createElement('div');
    body.className = 'flex flex-col gap-2 empty:hidden';
    const dots = document.createElement('span');
    dots.className = 'byte-dots';
    dots.setAttribute('aria-hidden', 'true');
    dots.append(document.createElement('span'), document.createElement('span'), document.createElement('span'));
    bubble.append(who, tools, body, dots);
    log.append(bubble);
    return { bubble, tools, body, dots };
  };

  const renderHistory = () => {
    log.querySelectorAll('[data-byte-turn]').forEach((el) => el.remove());
    for (const turn of history) {
      if (turn.role === 'user') userBubble(turn.text);
      else {
        const { body, dots } = byteBubble();
        dots.remove();
        renderBlocks(body, parseMarkdown(turn.text));
      }
    }
    scrollDown();
    updateChrome();
  };

  const post = (turns: ChatTurn[], token: string | undefined, signal: AbortSignal) =>
    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Turnstile-Token': token } : {}) },
      body: JSON.stringify({ locale, messages: turns.slice(-MAX_SENT) }),
      signal,
    });

  /** Sends the conversation; handles the bot check (once up front, again if the session expired). */
  const send = async (turns: ChatTurn[], signal: AbortSignal): Promise<Response> => {
    const siteKey = PUBLIC_TURNSTILE_SITE_KEY;
    const token = siteKey && !session.verified() ? await turnstileToken(turnstileBox, siteKey, language) : undefined;
    const response = await post(turns, token, signal);
    if (response.status === 403 && siteKey && !token) {
      const body = (await response
        .clone()
        .json()
        .catch(() => null)) as ErrorBody | null;
      if (body?.error === 'verify') {
        session.setVerified(false);
        return post(turns, await turnstileToken(turnstileBox, siteKey, language), signal);
      }
    }
    return response;
  };

  const errorText = (code: ByteErrorCode | 'network', retryAfter?: number) =>
    strings.errors[code].replace('{minutes}', String(Math.max(1, Math.ceil((retryAfter ?? 60) / 60))));

  const ask = async (question: string) => {
    const text = question.trim().slice(0, 500);
    if (!text || controller) return;
    hooks.onActivity?.();
    const turn = generation;

    history.push({ role: 'user', text });
    saveHistory(history);
    userBubble(text);
    const { tools, body, dots } = byteBubble();
    scrollDown();
    controller = new AbortController();
    const { signal } = controller;
    updateChrome();
    announce(strings.thinking);

    let answer = '';
    let failure: string | undefined;
    let frame = 0;
    const paint = () => {
      frame = 0;
      const stick = nearBottom();
      renderBlocks(body, parseMarkdown(answer));
      if (stick) scrollDown();
    };

    try {
      const response = await send(history, signal);
      if (!response.ok || !response.body) {
        const error = (await response.json().catch(() => null)) as ErrorBody | null;
        failure = errorText(error?.error ?? 'unavailable', error?.retryAfter);
      } else {
        session.setVerified(true);
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        const parse = createEventParser((event) => {
          if (event.type === 'text') {
            answer += event.text;
            frame ||= requestAnimationFrame(paint);
          } else if (event.type === 'tool') {
            const item = document.createElement('li');
            item.textContent = `↳ ${strings.tools[event.name].replace('{detail}', event.detail ?? '')}`;
            tools.append(item);
          } else if (event.type === 'error') {
            failure = errorText(event.code);
          }
        });
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          parse(value);
        }
      }
    } catch (error) {
      if (signal.aborted) failure = strings.stopped;
      else failure = errorText(error instanceof TypeError ? 'network' : 'verify');
    }

    if (frame) cancelAnimationFrame(frame);
    if (turn !== generation) return;
    answer = answer.trim();
    dots.remove();
    renderBlocks(body, parseMarkdown(answer));
    if (failure) {
      const note = document.createElement('div');
      // After a partial answer the note is a quiet footnote; on its own it is the reply.
      note.className = answer ? 'flex flex-col gap-2 text-sm text-ink-muted' : 'flex flex-col gap-2';
      renderBlocks(note, parseMarkdown(failure));
      body.append(note);
    }

    if (answer) history.push({ role: 'assistant', text: answer });
    // A question that got no answer isn't kept, so it isn't merged into the next one.
    else history.pop();
    saveHistory(history);
    controller = null;
    updateChrome();
    scrollDown();
    announce(`${strings.byteSaid} ${toPlainText(parseMarkdown([answer, failure].filter(Boolean).join('\n\n')))}`);
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const question = input.value;
    if (!question.trim() || controller) return;
    input.value = '';
    void ask(question);
    input.focus();
  });

  stopButton.addEventListener('click', () => {
    controller?.abort();
    input.focus();
  });

  for (const button of clearButtons) {
    button.addEventListener('click', () => {
      controller?.abort();
      controller = null;
      generation++;
      history = [];
      saveHistory(history);
      renderHistory();
      input.focus();
    });
  }

  for (const suggestion of root.querySelectorAll<HTMLButtonElement>('[data-chat-suggestion]')) {
    suggestion.addEventListener('click', () => void ask(suggestion.dataset['chatSuggestion'] ?? ''));
  }

  // Another tab (or the floating chat on another page) changed the conversation.
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY && !controller) {
      history = loadHistory();
      renderHistory();
    }
  });

  renderHistory();
  return { ask: (question) => void ask(question) };
}
