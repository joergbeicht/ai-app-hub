import { InjectionToken } from '@angular/core';

/**
 * Vollständiger Seitenwechsel (z. B. zum Keycloak-Login über das Backend). `location.assign`
 * ist in Tests nicht spionierbar, daher als Token gekapselt (wie `PAGE_RELOAD`).
 */
export const BROWSER_NAVIGATION = new InjectionToken<(url: string) => void>('BROWSER_NAVIGATION', {
  providedIn: 'root',
  factory: () => (url: string) => document.location.assign(url),
});
