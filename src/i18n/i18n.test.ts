import { describe, expect, it } from 'vitest';
import { isLocale, localeFromPath, localizePath, stripLocale } from './config';
import { useTranslations } from './ui';

describe('localeFromPath', () => {
  it('detects Polish pages by their prefix', () => {
    expect(localeFromPath('/pl/')).toBe('pl');
    expect(localeFromPath('/pl/projects/')).toBe('pl');
    expect(localeFromPath('/pl')).toBe('pl');
  });

  it('treats everything else as English', () => {
    expect(localeFromPath('/')).toBe('en');
    expect(localeFromPath('/projects/')).toBe('en');
    expect(localeFromPath('/en/projects/')).toBe('en');
    expect(localeFromPath('/plan/')).toBe('en');
  });
});

describe('stripLocale / localizePath', () => {
  it('removes the locale prefix', () => {
    expect(stripLocale('/pl/about/')).toBe('/about/');
    expect(stripLocale('/pl/')).toBe('/');
    expect(stripLocale('/pl')).toBe('/');
    expect(stripLocale('/about/')).toBe('/about/');
  });

  it('maps a page to its equivalent in another locale', () => {
    expect(localizePath('/', 'pl')).toBe('/pl/');
    expect(localizePath('/projects/', 'pl')).toBe('/pl/projects/');
    expect(localizePath('/pl/projects/', 'en')).toBe('/projects/');
    expect(localizePath('/pl/', 'en')).toBe('/');
    expect(localizePath('/pl/blog/', 'pl')).toBe('/pl/blog/');
  });
});

describe('isLocale', () => {
  it('accepts only supported locales', () => {
    expect(isLocale('pl')).toBe(true);
    expect(isLocale('de')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe('useTranslations', () => {
  it('translates and fills in placeholders', () => {
    expect(useTranslations('en')('home.greeting', { name: 'Piotr' })).toBe("Hi, I'm Piotr.");
    expect(useTranslations('pl')('home.greeting', { name: 'Piotr' })).toBe('Cześć, jestem Piotr.');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(useTranslations('en')('home.greeting')).toBe("Hi, I'm {name}.");
  });
});
