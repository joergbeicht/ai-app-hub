/** Supported UI and catalog locales for the App Hub. */
export type AppLocale = 'de' | 'en' | 'es' | 'fr' | 'tr' | 'it';

export interface AppLocaleOption {
  code: AppLocale;
  /** Native language name shown in the language selector. */
  nativeLabel: string;
}

export const APP_LOCALES: readonly AppLocaleOption[] = [
  { code: 'de', nativeLabel: 'Deutsch' },
  { code: 'en', nativeLabel: 'English' },
  { code: 'es', nativeLabel: 'Español' },
  { code: 'fr', nativeLabel: 'Français' },
  { code: 'tr', nativeLabel: 'Türkçe' },
  { code: 'it', nativeLabel: 'Italiano' },
] as const;

/** Locale codes only – for Transloco `availableLangs` and similar. */
export const APP_LOCALE_CODES: readonly AppLocale[] = APP_LOCALES.map((locale) => locale.code);

export const DEFAULT_APP_LOCALE: AppLocale = 'de';

export function isAppLocale(value: string | null | undefined): value is AppLocale {
  return APP_LOCALES.some((locale) => locale.code === value);
}
