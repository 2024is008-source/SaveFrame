export const locales = ['en', 'es', 'pt-br', 'de', 'fr', 'ja', 'id', 'tr', 'hi', 'ar'] as const;
export type Locale = typeof locales[number];
export const isLocale = (value: string): value is Locale => locales.includes(value as Locale);
export const localePath = (locale: Locale) => locale === 'en' ? '/' : `/${locale}/`;
export const languageTag = (locale: Locale) => locale === 'pt-br' ? 'pt-BR' : locale;
export const localeOptions: Record<Locale, string> = { en: 'EN · English', es: 'ES · Español', 'pt-br': 'PT · Português (Brasil)', de: 'DE · Deutsch', fr: 'FR · Français', ja: 'JA · 日本語', id: 'ID · Bahasa Indonesia', tr: 'TR · Türkçe', hi: 'HI · हिन्दी', ar: 'AR · العربية' };
export const ogLocales: Record<Locale, string> = { en: 'en_US', es: 'es_ES', 'pt-br': 'pt_BR', de: 'de_DE', fr: 'fr_FR', ja: 'ja_JP', id: 'id_ID', tr: 'tr_TR', hi: 'hi_IN', ar: 'ar_AR' };
