import { describe, expect, it } from 'vitest';
import { pickLocalized, splitId } from './localized';

const entries = [
  { id: 'en/alpha', title: 'Alpha' },
  { id: 'pl/alpha', title: 'Alfa' },
  { id: 'en/beta', title: 'Beta' },
  { id: 'pl/gamma', title: 'Gamma (PL only)' },
];

describe('splitId', () => {
  it('splits locale folder and slug', () => {
    expect(splitId('pl/simsify-life')).toEqual({ locale: 'pl', slug: 'simsify-life' });
    expect(splitId('en/nested/post')).toEqual({ locale: 'en', slug: 'nested/post' });
  });

  it('rejects ids outside a locale folder', () => {
    expect(() => splitId('simsify-life')).toThrow(/locale folder/);
    expect(() => splitId('de/post')).toThrow(/locale folder/);
  });
});

describe('pickLocalized', () => {
  it('returns the default locale as-is', () => {
    const result = pickLocalized(entries, 'en');
    expect(result.map((e) => [e.slug, e.title, e.isFallback])).toEqual([
      ['alpha', 'Alpha', false],
      ['beta', 'Beta', false],
    ]);
  });

  it('prefers translations and falls back to English when one is missing', () => {
    const result = pickLocalized(entries, 'pl');
    expect(result.map((e) => [e.slug, e.title, e.locale, e.isFallback])).toEqual([
      ['alpha', 'Alfa', 'pl', false],
      ['beta', 'Beta', 'en', true],
      ['gamma', 'Gamma (PL only)', 'pl', false],
    ]);
  });
});
