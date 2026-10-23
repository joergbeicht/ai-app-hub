import { DEFAULT_APP_LOCALE, type AppLocale } from './locale.model';
import {
  createLocalizedText,
  resolveLocalizedText,
  toLocalizedText,
  type LocalizedText,
  type LocalizedTextInput,
} from './localized-text';

/** A single app entry shown as a card on the hub page (merged content + personal preference). */
export interface AppEntry {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  url: string;
  iconType: 'image' | 'mat-icon';
  icon: string;
  /** When false, the app is hidden on the hub for THIS browser only (see `PersonalAppPreferences` -
   * siehe ADR-17, ist bewusst nie Teil des zentralen Katalogs). */
  enabled: boolean;
}

/**
 * Der zentrale, von einem Administrator gepflegte App-Katalog (`GET/PUT /hub-apps`, siehe
 * ADR-17) - "die Wahrheit" für alle Benutzer. Enthält bewusst kein `enabled` - Sichtbarkeit ist
 * rein persönlich (siehe `AppEntry`/`PersonalAppPreferences`).
 */
export interface HubAppContent {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  url: string;
  iconType: 'image' | 'mat-icon';
  icon: string;
  sortOrder: number;
}

/** Raw JSON shape as returned by the backend (accepts legacy string name/description). */
export interface RawHubAppContent {
  id: string;
  name: LocalizedTextInput;
  description: LocalizedTextInput;
  url: string;
  iconType: 'image' | 'mat-icon';
  icon: string;
  sortOrder?: number;
}

export function normalizeHubAppContent(raw: RawHubAppContent, index: number): HubAppContent {
  return {
    id: raw.id,
    name: toLocalizedText(raw.name),
    description: toLocalizedText(raw.description),
    url: raw.url,
    iconType: raw.iconType === 'image' ? 'image' : 'mat-icon',
    icon: raw.icon ?? '',
    sortOrder: raw.sortOrder ?? index,
  };
}

export function normalizeHubAppContentList(
  raw: RawHubAppContent[] | null | undefined,
): HubAppContent[] {
  return (raw ?? []).map((app, index) => normalizeHubAppContent(app, index));
}

/**
 * Rein persönliche, lokale Präferenz für DIESEN Browser (siehe ADR-17) - niemals Inhalt
 * (Name/Beschreibung/URL/Icon), nur Reihenfolge + Sichtbarkeit. Fehlende Ids in `order` (z. B. eine
 * neue App im zentralen Katalog seit der letzten persönlichen Anpassung) werden angehängt, in der
 * vom Katalog vorgegebenen Basis-Reihenfolge.
 */
export interface PersonalAppPreferences {
  order: string[];
  disabledIds: string[];
}

/** Merge des zentralen Katalogs mit der persönlichen Präferenz dieses Browsers zum finalen `AppEntry[]`. */
export function applyPersonalPreferences(
  content: HubAppContent[],
  prefs: PersonalAppPreferences | null,
): AppEntry[] {
  const byId = new Map(content.map((app) => [app.id, app]));
  const disabledIds = new Set(prefs?.disabledIds ?? []);
  const orderedIds = (prefs?.order ?? []).filter((id) => byId.has(id));
  const orderedIdSet = new Set(orderedIds);
  const remainingIds = content.map((app) => app.id).filter((id) => !orderedIdSet.has(id));

  return [...orderedIds, ...remainingIds].map((id) => {
    const app = byId.get(id) as HubAppContent;
    return {
      id: app.id,
      name: app.name,
      description: app.description,
      url: app.url,
      iconType: app.iconType,
      icon: app.icon,
      enabled: !disabledIds.has(app.id),
    };
  });
}

/** Extrahiert die persönliche Präferenz (Reihenfolge + Sichtbarkeit) aus dem aktuellen Zustand der
 * Settings-Seite - unabhängig davon, ob die Inhalte selbst gerade zentral (Admin) oder gar nicht
 * verändert wurden. */
export function toPersonalPreferences(apps: AppEntry[]): PersonalAppPreferences {
  return {
    order: apps.map((app) => app.id),
    disabledIds: apps.filter((app) => !app.enabled).map((app) => app.id),
  };
}

/**
 * Overrides the `url` of matching apps with real in-cluster URLs (see `HubCatalogController`
 * in the backend). Must run BEFORE personal preferences are applied - a locally stored
 * preference never touches `url` anyway, but this keeps the "content" step self-contained. Only
 * known, non-empty URLs win - anything the Kubernetes lookup doesn't know about keeps whatever
 * URL the central catalog already had, so a missing/unreachable live source never breaks the hub.
 */
export function applyLiveUrls(
  content: HubAppContent[],
  liveUrls: Record<string, string>,
): HubAppContent[] {
  if (!content.length || !Object.keys(liveUrls).length) {
    return content;
  }
  return content.map((app) => {
    const liveUrl = liveUrls[app.id];
    return typeof liveUrl === 'string' && liveUrl ? { ...app, url: liveUrl } : app;
  });
}

export function appDisplayName(app: { name: LocalizedText }, locale: AppLocale): string {
  return resolveLocalizedText(app.name, locale, DEFAULT_APP_LOCALE);
}

export function appDisplayDescription(
  app: { description: LocalizedText },
  locale: AppLocale,
): string {
  return resolveLocalizedText(app.description, locale, DEFAULT_APP_LOCALE);
}

export function withLocaleText(
  text: LocalizedText,
  locale: AppLocale,
  value: string,
): LocalizedText {
  return { ...text, [locale]: value };
}

export function newAppEntry(partial: {
  id: string;
  name: string;
  description?: string;
  url: string;
  iconType: 'image' | 'mat-icon';
  icon: string;
  locale?: AppLocale;
}): AppEntry {
  const locale = partial.locale ?? DEFAULT_APP_LOCALE;
  return {
    id: partial.id,
    name: createLocalizedText(partial.name, locale),
    description: createLocalizedText(partial.description ?? '', locale),
    url: partial.url,
    iconType: partial.iconType,
    icon: partial.icon,
    enabled: true,
  };
}
