/**
 * Muss exakt den vom Frontend unterstützten Locales entsprechen (siehe
 * `frontend/src/app/core/models/locale.model.ts`, `APP_LOCALES`).
 */
export const HUB_APP_LOCALES = ['de', 'en', 'es', 'fr', 'tr', 'it'] as const;
export type HubAppLocale = (typeof HUB_APP_LOCALES)[number];
