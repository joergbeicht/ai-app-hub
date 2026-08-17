import { DEFAULT_APP_LOCALE, type AppLocale } from './locale.model';
import {
  createLocalizedText,
  mergeLocalizedText,
  resolveLocalizedText,
  toLocalizedText,
  type LocalizedText,
  type LocalizedTextInput,
} from './localized-text';

/** A single app entry shown as a card on the hub page. */
export interface AppEntry {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  url: string;
  iconType: 'image' | 'mat-icon';
  icon: string;
  /** When false, the app is hidden on the hub (still editable in settings). */
  enabled: boolean;
}

/** Shape of konfiguration.json (accepts legacy string name/description). */
export interface AppConfig {
  defaultIcon: string;
  apps: AppEntry[];
}

/** Raw JSON shape that may still use plain-string name/description. */
export interface RawAppEntry {
  id: string;
  name: LocalizedTextInput;
  description: LocalizedTextInput;
  url: string;
  iconType: 'image' | 'mat-icon';
  icon: string;
  enabled?: boolean;
}

export interface RawAppConfig {
  defaultIcon?: string;
  apps?: RawAppEntry[];
}

export function normalizeAppEntry(raw: RawAppEntry): AppEntry {
  return {
    id: raw.id,
    name: toLocalizedText(raw.name),
    description: toLocalizedText(raw.description),
    url: raw.url,
    iconType: raw.iconType === 'image' ? 'image' : 'mat-icon',
    icon: raw.icon ?? '',
    // Legacy entries without `enabled` are treated as visible.
    enabled: raw.enabled !== false,
  };
}

export function normalizeAppConfig(raw: RawAppConfig | null | undefined): AppConfig {
  return {
    defaultIcon: raw?.defaultIcon || 'apps',
    apps: (raw?.apps ?? []).map((app) => normalizeAppEntry(app)),
  };
}

/**
 * Merge a stored (possibly legacy/edited) config with the bundled asset.
 * Keeps the stored app list order (including deletions/additions/reorder) and
 * fills empty locale slots for name/description from the asset by app id.
 */
export function mergeAppConfig(stored: RawAppConfig, asset: RawAppConfig): AppConfig {
  const normalizedStored = normalizeAppConfig(stored);
  const normalizedAsset = normalizeAppConfig(asset);
  const assetById = new Map(normalizedAsset.apps.map((app) => [app.id, app]));

  const apps: AppEntry[] = normalizedStored.apps.map((app) => {
    const fromAsset = assetById.get(app.id);
    if (!fromAsset) {
      return app;
    }
    return {
      ...app,
      name: mergeLocalizedText(app.name, fromAsset.name),
      description: mergeLocalizedText(app.description, fromAsset.description),
      // Prefer stored operational fields (URL/icon/enabled/order) – user-editable.
      url: app.url || fromAsset.url,
      iconType: app.iconType || fromAsset.iconType,
      icon: app.icon || fromAsset.icon,
      enabled: app.enabled,
    };
  });

  return {
    defaultIcon: normalizedStored.defaultIcon || normalizedAsset.defaultIcon,
    apps,
  };
}

/**
 * Overrides the `url` of matching apps with real in-cluster URLs (see `HubCatalogController`
 * in the backend). Only known, non-empty URLs win - anything the Kubernetes lookup doesn't know
 * about keeps its bundled default (typically a localhost dev URL), so a missing/unreachable
 * live source never breaks the hub.
 */
export function applyLiveUrls(raw: RawAppConfig, liveUrls: Record<string, string>): RawAppConfig {
  if (!raw.apps?.length || !Object.keys(liveUrls).length) {
    return raw;
  }
  return {
    ...raw,
    apps: raw.apps.map((app) => {
      const liveUrl = liveUrls[app.id];
      return typeof liveUrl === 'string' && liveUrl ? { ...app, url: liveUrl } : app;
    }),
  };
}

export function appDisplayName(app: AppEntry, locale: AppLocale): string {
  return resolveLocalizedText(app.name, locale, DEFAULT_APP_LOCALE);
}

export function appDisplayDescription(app: AppEntry, locale: AppLocale): string {
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
  enabled?: boolean;
}): AppEntry {
  const locale = partial.locale ?? DEFAULT_APP_LOCALE;
  return {
    id: partial.id,
    name: createLocalizedText(partial.name, locale),
    description: createLocalizedText(partial.description ?? '', locale),
    url: partial.url,
    iconType: partial.iconType,
    icon: partial.icon,
    enabled: partial.enabled !== false,
  };
}
