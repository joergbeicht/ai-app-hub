import {
  APP_LOCALES,
  DEFAULT_APP_LOCALE,
  type AppLocale,
  isAppLocale,
} from './locale.model';

/** Name/description text available in every supported hub locale. */
export type LocalizedText = Record<AppLocale, string>;

/** Runtime shape before normalization (legacy string or partial map). */
export type LocalizedTextInput = string | Partial<Record<AppLocale, string>> | null | undefined;

/** Empty localized text (all locales blank). */
export function emptyLocalizedText(): LocalizedText {
  const text = {} as LocalizedText;
  for (const { code } of APP_LOCALES) {
    text[code] = '';
  }
  return text;
}

/** Build a LocalizedText, optionally seeding one locale. */
export function createLocalizedText(
  seed = '',
  locale: AppLocale = DEFAULT_APP_LOCALE,
): LocalizedText {
  const text = emptyLocalizedText();
  text[locale] = seed;
  return text;
}

/**
 * Normalize legacy plain strings or partial maps into a full LocalizedText.
 * A plain string is treated as German-only (legacy konfiguration / localStorage).
 */
export function toLocalizedText(value: LocalizedTextInput): LocalizedText {
  if (typeof value === 'string') {
    return createLocalizedText(value, DEFAULT_APP_LOCALE);
  }
  const text = emptyLocalizedText();
  if (!value || typeof value !== 'object') {
    return text;
  }
  for (const { code } of APP_LOCALES) {
    const entry = value[code];
    if (typeof entry === 'string') {
      text[code] = entry;
    }
  }
  return text;
}

/** Pick the best string for a locale; falls back to German, then any non-empty value. */
export function resolveLocalizedText(
  value: LocalizedTextInput,
  locale: AppLocale,
  fallbackLocale: AppLocale = DEFAULT_APP_LOCALE,
): string {
  const text = toLocalizedText(value);
  if (text[locale]) {
    return text[locale];
  }
  if (text[fallbackLocale]) {
    return text[fallbackLocale];
  }
  for (const { code } of APP_LOCALES) {
    if (text[code]) {
      return text[code];
    }
  }
  return '';
}

/** Fill empty locale slots in `base` from `fallback` (e.g. asset catalog). */
export function mergeLocalizedText(base: LocalizedTextInput, fallback: LocalizedTextInput): LocalizedText {
  const primary = toLocalizedText(base);
  const secondary = toLocalizedText(fallback);
  const merged = emptyLocalizedText();
  for (const { code } of APP_LOCALES) {
    merged[code] = primary[code] || secondary[code];
  }
  return merged;
}

export function isLocalizedText(value: unknown): value is LocalizedText {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return APP_LOCALES.every(
    ({ code }) => isAppLocale(code) && typeof record[code] === 'string',
  );
}
