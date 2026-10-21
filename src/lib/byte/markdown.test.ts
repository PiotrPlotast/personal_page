import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown, safeHref, toPlainText } from './markdown';

describe('parseInline', () => {
  it('handles bold, italic, code and links', () => {
    expect(parseInline('**Reclaim** is *neat*, see `npm i` or [the page](/projects/reclaim/).')).toEqual([
      { type: 'strong', children: [{ type: 'text', text: 'Reclaim' }] },
      { type: 'text', text: ' is ' },
      { type: 'em', children: [{ type: 'text', text: 'neat' }] },
      { type: 'text', text: ', see ' },
      { type: 'code', text: 'npm i' },
      { type: 'text', text: ' or ' },
      { type: 'link', href: '/projects/reclaim/', children: [{ type: 'text', text: 'the page' }] },
      { type: 'text', text: '.' },
    ]);
  });

  it('leaves unfinished markers (mid-stream) as text', () => {
    expect(parseInline('**Recl')).toEqual([{ type: 'text', text: '**Recl' }]);
    expect(parseInline('[the pa')).toEqual([{ type: 'text', text: '[the pa' }]);
  });

  it('never links to unsafe URLs', () => {
    expect(parseInline('[x](javascript:alert(1))')[0]).toEqual({ type: 'text', text: '[x](javascript:alert(1)' });
    expect(safeHref('//evil.example')).toBeNull();
    expect(safeHref('data:text/html,hi')).toBeNull();
    expect(safeHref('https://github.com/PiotrPlotast')).toBe('https://github.com/PiotrPlotast');
    expect(safeHref('mailto:hi@example.com')).toBe('mailto:hi@example.com');
  });

  it("doesn't treat multiplication or list stars as italics", () => {
    expect(parseInline('2 * 3 * 4')).toEqual([{ type: 'text', text: '2 * 3 * 4' }]);
  });
});

describe('parseMarkdown', () => {
  it('splits paragraphs and lists', () => {
    expect(parseMarkdown('He built:\n\n- Reclaim\n- **Byte**\n\n1. First\n2. Second\nThanks!')).toEqual([
      { type: 'p', children: [{ type: 'text', text: 'He built:' }] },
      {
        type: 'ul',
        items: [[{ type: 'text', text: 'Reclaim' }], [{ type: 'strong', children: [{ type: 'text', text: 'Byte' }] }]],
      },
      { type: 'ol', items: [[{ type: 'text', text: 'First' }], [{ type: 'text', text: 'Second' }]] },
      { type: 'p', children: [{ type: 'text', text: 'Thanks!' }] },
    ]);
  });

  it('flattens headings into text', () => {
    expect(parseMarkdown('## Projects')).toEqual([{ type: 'p', children: [{ type: 'text', text: 'Projects' }] }]);
  });

  it('gives plain text for announcements', () => {
    expect(toPlainText(parseMarkdown('**Hi.** Built:\n- [Reclaim](/p/)\n- Byte'))).toBe('Hi. Built: Reclaim; Byte');
  });
});
