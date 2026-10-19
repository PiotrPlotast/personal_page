export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme';

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

/** An explicit choice the visitor made wins; otherwise follow the OS setting. */
export function resolveTheme(stored: string | null | undefined, prefersDark: boolean): Theme {
  if (isTheme(stored)) return stored;
  return prefersDark ? 'dark' : 'light';
}

export function nextTheme(current: Theme): Theme {
  return current === 'dark' ? 'light' : 'dark';
}

export interface ThemeLabels {
  toDark: string;
  toLight: string;
}

const englishLabels: ThemeLabels = { toDark: 'Switch to dark theme', toLight: 'Switch to light theme' };

/** The toggle's accessible name describes the action it will take, in the page's language. */
export function themeToggleLabel(current: Theme, labels: ThemeLabels = englishLabels): string {
  return current === 'dark' ? labels.toLight : labels.toDark;
}
