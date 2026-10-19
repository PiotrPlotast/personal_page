import { describe, expect, it } from 'vitest';
import { formatDate, isoDate, readingMinutes, slugify } from './format';

describe('formatDate', () => {
  const date = new Date('2026-10-19T00:00:00Z');

  it('formats dates in the page language', () => {
    expect(formatDate(date, 'en')).toBe('19 October 2026');
    expect(formatDate(date, 'pl')).toBe('19 października 2026');
  });

  it('gives an ISO date for <time datetime>', () => {
    expect(isoDate(date)).toBe('2026-10-19');
  });
});

describe('readingMinutes', () => {
  it('counts prose at 200 words a minute, rounding to whole minutes', () => {
    expect(readingMinutes('word '.repeat(600))).toBe(3);
    expect(readingMinutes('word '.repeat(700))).toBe(4);
  });

  it('never says zero minutes', () => {
    expect(readingMinutes('')).toBe(1);
  });

  it('ignores code blocks, markup and link URLs', () => {
    const body = [
      'word '.repeat(400),
      '```ts\n' + 'const x = 1; '.repeat(500) + '\n```',
      '<Callout type="tip">',
      '[link text](https://example.com/a/very/long/url)',
      '<!-- TODO: lots of words here that should not count -->',
    ].join('\n');
    expect(readingMinutes(body)).toBe(2);
  });
});

describe('slugify', () => {
  it('makes URL-safe slugs, including Polish characters', () => {
    expect(slugify('Next.js & React')).toBe('next-js-react');
    expect(slugify('Dostępność')).toBe('dostepnosc');
    expect(slugify('Łódź')).toBe('lodz');
    expect(slugify('  accessibility ')).toBe('accessibility');
  });
});
