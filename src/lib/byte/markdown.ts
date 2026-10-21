/**
 * The small slice of Markdown Byte is asked to write: paragraphs, bullet and numbered lists,
 * **bold**, *italic*, `code` and [links](url). Parsed into a tree that the chat renders with DOM
 * methods, never innerHTML, so model output can't inject markup. Unfinished syntax mid-stream
 * just shows as text until its closing marker arrives.
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong' | 'em'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: Inline[] };

export type Block = { type: 'p'; children: Inline[] } | { type: 'ul' | 'ol'; items: Inline[][] };

/** Site paths, web and mail links only; anything else (javascript:, data:, …) stays plain text. */
export function safeHref(href: string): string | null {
  const trimmed = href.trim();
  if (/^\/(?!\/)/.test(trimmed)) return trimmed;
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
  return null;
}

const INLINE = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?![*\w])/g;

export function parseInline(text: string): Inline[] {
  const nodes: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const [whole, strong, code, linkText, href, em] = match;
    const index = match.index;
    if (index > last) nodes.push({ type: 'text', text: text.slice(last, index) });
    if (strong !== undefined) nodes.push({ type: 'strong', children: parseInline(strong) });
    else if (code !== undefined) nodes.push({ type: 'code', text: code });
    else if (linkText !== undefined && href !== undefined) {
      const safe = safeHref(href);
      nodes.push(safe ? { type: 'link', href: safe, children: parseInline(linkText) } : { type: 'text', text: whole });
    } else if (em !== undefined) nodes.push({ type: 'em', children: parseInline(em) });
    last = index + whole.length;
  }
  if (last < text.length) nodes.push({ type: 'text', text: text.slice(last) });
  return nodes;
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

export function parseMarkdown(markdown: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'p', children: parseInline(paragraph.join('\n')) });
    paragraph = [];
  };

  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const item = bullet ?? numbered;
    if (item) {
      flush();
      const type = bullet ? 'ul' : 'ol';
      const previous = blocks.at(-1);
      const content = parseInline(item[1] ?? '');
      if (previous?.type === type) previous.items.push(content);
      else blocks.push({ type, items: [content] });
    } else if (!line.trim()) {
      flush();
    } else {
      // Headings aren't wanted in chat; show their text as a normal line.
      paragraph.push(line.replace(/^#{1,6}\s+/, ''));
    }
  }
  flush();
  return blocks;
}

/** Plain text for screen-reader announcements. */
export function toPlainText(blocks: Block[]): string {
  const inline = (nodes: Inline[]): string =>
    nodes.map((node) => ('children' in node ? inline(node.children) : node.text)).join('');
  return blocks
    .map((block) => (block.type === 'p' ? inline(block.children) : block.items.map(inline).join('; ')))
    .join(' ');
}
