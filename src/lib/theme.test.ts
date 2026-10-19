import { describe, expect, it } from 'vitest';
import { isTheme, nextTheme, resolveTheme, themeToggleLabel } from './theme';

describe('resolveTheme', () => {
  it('uses a stored choice over the system preference', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('falls back to the system preference when nothing valid is stored', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(undefined, false)).toBe('light');
    expect(resolveTheme('sepia', true)).toBe('dark');
  });
});

describe('nextTheme', () => {
  it('flips between light and dark', () => {
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('light');
  });
});

describe('themeToggleLabel', () => {
  it('describes the action, not the current state', () => {
    expect(themeToggleLabel('light')).toBe('Switch to dark theme');
    expect(themeToggleLabel('dark')).toBe('Switch to light theme');
  });
});

describe('isTheme', () => {
  it('only accepts known themes', () => {
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('Dark')).toBe(false);
    expect(isTheme(1)).toBe(false);
  });
});
