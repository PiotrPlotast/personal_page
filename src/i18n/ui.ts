import { defaultLocale, type Locale } from './config';

/**
 * Interface strings. English is the source of truth; the Polish dictionary must define every key
 * (enforced by `satisfies`), so a missing translation fails the type check.
 */
const en = {
  'site.description':
    'Piotr Płotast, frontend developer and student from Poland. Projects, writing and an AI agent that answers questions about me.',
  'a11y.skip': 'Skip to content',
  'nav.label': 'Main',
  'nav.projects': 'Projects',
  'nav.blog': 'Blog',
  'nav.about': 'About',
  'nav.contact': 'Contact',
  'lang.label': 'Language',
  'theme.toDark': 'Switch to dark theme',
  'theme.toLight': 'Switch to light theme',
  'footer.builtWith': 'Built with Astro',
  'footer.source': 'Source on GitHub',

  'home.greeting': "Hi, I'm {name}.",
  'home.aka': 'a.k.a. {nickname}',
  'home.seeWork': 'See my work',
  'home.moreAbout': 'More about me',
  'home.featured': 'Featured',
  'home.moreProjects': 'More projects',
  'home.allProjects': 'All projects →',
  'home.technologies': 'Technologies',
  'home.contactTitle': "Let's work together.",
  'home.contactText': 'I reply within a day or two.',
  'home.writeToMe': 'Write to me',

  'chat.title': 'Ask Byte',
  'chat.status': 'In training',
  'chat.expand': 'Expand chat',
  'chat.collapse': 'Close full chat',
  'chat.log': 'Conversation with Byte',
  'chat.suggestions': 'Suggested questions',
  'chat.inputLabel': 'Ask Byte a question about Piotr',
  'chat.placeholder': 'Ask anything about Piotr…',
  'chat.send': 'Send question',

  'page.projects': 'Projects',
  'page.blog': 'Blog',
  'page.about': 'About',
  'page.contact': 'Contact',
  'soon.eyebrow': 'Under construction',
  'soon.text': 'This page is being built ({what}). Check back soon.',
  'soon.projects': 'projects with case studies',
  'soon.blog': 'posts, tags and search',
  'soon.about': 'skills, experience and CV',
  'soon.contact': 'contact form',
  'common.backHome': '← Back home',
  'notFound.title': 'Page not found',
  'notFound.heading': "This page doesn't exist.",
  'notFound.text': 'Maybe it moved, or maybe it was never here.',
} as const;

export type UiKey = keyof typeof en;

const pl = {
  'site.description':
    'Piotr Płotast, frontend developer i student z Polski. Projekty, wpisy i agent AI, który odpowiada na pytania o mnie.',
  'a11y.skip': 'Przejdź do treści',
  'nav.label': 'Główna',
  'nav.projects': 'Projekty',
  'nav.blog': 'Blog',
  'nav.about': 'O mnie',
  'nav.contact': 'Kontakt',
  'lang.label': 'Język',
  'theme.toDark': 'Włącz ciemny motyw',
  'theme.toLight': 'Włącz jasny motyw',
  'footer.builtWith': 'Zbudowane w Astro',
  'footer.source': 'Kod na GitHubie',

  'home.greeting': 'Cześć, jestem {name}.',
  'home.aka': 'alias {nickname}',
  'home.seeWork': 'Zobacz projekty',
  'home.moreAbout': 'Więcej o mnie',
  'home.featured': 'Wyróżniony',
  'home.moreProjects': 'Inne projekty',
  'home.allProjects': 'Wszystkie projekty →',
  'home.technologies': 'Technologie',
  'home.contactTitle': 'Popracujmy razem.',
  'home.contactText': 'Odpisuję w ciągu dnia lub dwóch.',
  'home.writeToMe': 'Napisz do mnie',

  'chat.title': "Zapytaj Byte'a",
  'chat.status': 'W trakcie nauki',
  'chat.expand': 'Rozwiń czat',
  'chat.collapse': 'Zamknij pełny czat',
  'chat.log': "Rozmowa z Byte'em",
  'chat.suggestions': 'Przykładowe pytania',
  'chat.inputLabel': "Zadaj Byte'owi pytanie o Piotra",
  'chat.placeholder': 'Zapytaj o cokolwiek o Piotrze…',
  'chat.send': 'Wyślij pytanie',

  'page.projects': 'Projekty',
  'page.blog': 'Blog',
  'page.about': 'O mnie',
  'page.contact': 'Kontakt',
  'soon.eyebrow': 'W budowie',
  'soon.text': 'Ta strona jest w budowie ({what}). Wróć wkrótce.',
  'soon.projects': 'projekty z opisami',
  'soon.blog': 'wpisy, tagi i wyszukiwarka',
  'soon.about': 'umiejętności, doświadczenie i CV',
  'soon.contact': 'formularz kontaktowy',
  'common.backHome': '← Strona główna',
  'notFound.title': 'Nie znaleziono strony',
  'notFound.heading': 'Ta strona nie istnieje.',
  'notFound.text': 'Może się przeniosła, a może nigdy jej tu nie było.',
} as const satisfies Record<UiKey, string>;

const dictionaries: Record<Locale, Record<UiKey, string>> = { en, pl };

/** `t('home.greeting', { name: 'Piotr' })` → "Hi, I'm Piotr." in the given locale. */
export function useTranslations(locale: Locale) {
  return function t(key: UiKey, params: Record<string, string> = {}): string {
    const template = dictionaries[locale][key] ?? dictionaries[defaultLocale][key];
    return template.replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match);
  };
}
