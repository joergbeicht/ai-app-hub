import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  applyLiveUrls,
  applyPersonalPreferences,
  normalizeHubAppContentList,
  toPersonalPreferences,
  type AppEntry,
  type HubAppContent,
  type PersonalAppPreferences,
  type RawHubAppContent,
} from '../models/app-config.model';
import { RUNTIME_CONFIG } from '../runtime-config';

const STORAGE_KEY = 'app-hub-personal-preferences';
const DEFAULT_ICON = 'apps';

/**
 * Der App-Katalog kommt ausschließlich vom Backend (`GET/PUT /hub-apps`, siehe ADR-17) - das
 * ist die einzige, für alle Benutzer gültige Wahrheit. Dieser Service speichert lokal (pro
 * Browser) NUR noch die persönliche Präferenz (Reihenfolge + Sichtbarkeit), niemals Inhalt
 * (Name/Beschreibung/URL/Icon) - das verhindert genau den Bug, dass eine zentrale Katalog-
 * Änderung durch eine veraltete `localStorage`-Kopie verdeckt wird.
 */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly http = inject(HttpClient);
  private readonly backendApiUrl = inject(RUNTIME_CONFIG).backendApiUrl;
  private readonly contentSignal = signal<HubAppContent[]>([]);
  private readonly personalPreferencesSignal = signal<PersonalAppPreferences | null>(null);
  private readonly loadedSignal = signal<boolean>(false);

  /** All catalog apps merged with this browser's personal order/visibility. Order = hub order. */
  readonly apps = computed(() =>
    applyPersonalPreferences(this.contentSignal(), this.personalPreferencesSignal()),
  );
  /** Apps visible on the hub (enabled only, same order as settings). */
  readonly visibleApps = computed(() => this.apps().filter((app) => app.enabled));
  readonly defaultIcon = computed(() => DEFAULT_ICON);
  readonly loaded = this.loadedSignal.asReadonly();

  /**
   * Load the central catalog content from the backend, apply the live in-cluster URLs (see
   * `applyLiveUrls`), then apply this browser's personal preferences on top. Skips network
   * reload when already loaded unless `force` is set (e.g. after a central-catalog save).
   */
  async load(force = false): Promise<void> {
    if (this.loadedSignal() && !force) {
      return;
    }
    const [content, liveUrls] = await Promise.all([
      this.loadHubAppsContent(),
      this.loadLiveCatalogUrls(),
    ]);
    this.contentSignal.set(applyLiveUrls(content, liveUrls));
    this.personalPreferencesSignal.set(this.getStoredPreferences());
    this.loadedSignal.set(true);
  }

  /**
   * Ersetzt den zentralen Katalog (Administrator-only, serverseitig per `RolesGuard` erzwungen -
   * siehe `HubAppsController`) - wirkt sofort für ALLE Benutzer, nicht nur diesen Browser.
   */
  async saveCentralCatalog(apps: AppEntry[]): Promise<void> {
    const body = {
      apps: apps.map((app) => ({
        id: app.id,
        name: app.name,
        description: app.description,
        url: app.url,
        iconType: app.iconType,
        icon: app.icon,
      })),
    };
    const raw = await firstValueFrom(
      this.http.put<RawHubAppContent[]>(`${this.backendApiUrl}/hub-apps`, body),
    );
    this.contentSignal.set(normalizeHubAppContentList(raw));
  }

  /** Persist this browser's personal order/visibility preference (never content). */
  savePersonalPreferences(apps: AppEntry[]): void {
    const prefs = toPersonalPreferences(apps);
    this.personalPreferencesSignal.set(prefs);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch (e) {
      console.warn('ConfigService: localStorage.setItem failed', e);
    }
  }

  /** Clear this browser's personal order/visibility preference (falls back to catalog order, all enabled). */
  resetPersonalPreferences(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('ConfigService: localStorage.removeItem failed', e);
    }
    this.personalPreferencesSignal.set(null);
  }

  private getStoredPreferences(): PersonalAppPreferences | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<PersonalAppPreferences>;
      if (!Array.isArray(parsed.order) || !Array.isArray(parsed.disabledIds)) {
        return null;
      }
      return { order: parsed.order, disabledIds: parsed.disabledIds };
    } catch {
      return null;
    }
  }

  private async loadHubAppsContent(): Promise<HubAppContent[]> {
    try {
      const raw = await firstValueFrom(
        this.http.get<RawHubAppContent[]>(`${this.backendApiUrl}/hub-apps`),
      );
      return normalizeHubAppContentList(raw);
    } catch (e) {
      console.warn('ConfigService: failed to load hub-apps catalog from backend', e);
      return [];
    }
  }

  /**
   * Fragt die echten In-Cluster-URLs beim eigenen Backend ab (siehe `HubCatalogController`).
   * Läuft bewusst nie hart fehlschlagend: ohne Antwort/bei Fehlern behält der Katalog seine
   * zentral hinterlegten URLs unverändert (siehe `applyLiveUrls`).
   */
  private async loadLiveCatalogUrls(): Promise<Record<string, string>> {
    try {
      const res = await fetch(`${this.backendApiUrl}/hub-catalog-urls`);
      if (!res.ok) return {};
      const data: unknown = await res.json();
      return data && typeof data === 'object' ? (data as Record<string, string>) : {};
    } catch {
      return {};
    }
  }
}
