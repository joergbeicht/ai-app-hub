import { Injectable, signal, computed, inject } from '@angular/core';
import {
  applyLiveUrls,
  mergeAppConfig,
  normalizeAppConfig,
  type AppConfig,
  type AppEntry,
  type RawAppConfig,
} from '../models/app-config.model';
import { RUNTIME_CONFIG } from '../runtime-config';

const CONFIG_ASSET = 'assets/konfiguration.json';
const STORAGE_KEY = 'app-hub-config';

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly backendApiUrl = inject(RUNTIME_CONFIG).backendApiUrl;
  private readonly configSignal = signal<AppConfig | null>(null);
  private readonly loadedSignal = signal<boolean>(false);

  /** All configured apps (settings), including disabled ones. Order = hub order. */
  readonly apps = computed(() => this.configSignal()?.apps ?? []);
  /** Apps visible on the hub (enabled only, same order as settings). */
  readonly visibleApps = computed(() => this.apps().filter((app) => app.enabled));
  readonly defaultIcon = computed(() => this.configSignal()?.defaultIcon ?? 'apps');
  readonly loaded = this.loadedSignal.asReadonly();

  /**
   * Load configuration: merge localStorage (if present) with the bundled asset, then apply the
   * live in-cluster URLs as the final, highest-priority step - a locally stored override (e.g.
   * from a past Settings edit) must never keep a stale dev URL alive once Kubernetes knows the
   * real one (see `applyLiveUrls`).
   * Skips network reload when already loaded unless `force` is set (e.g. reset).
   */
  async load(force = false): Promise<void> {
    if (this.loadedSignal() && !force) {
      return;
    }
    const [asset, liveUrls] = await Promise.all([
      this.loadAssetConfig(),
      this.loadLiveCatalogUrls(),
    ]);
    const stored = this.getStoredConfig();
    const merged = stored ? mergeAppConfig(stored, asset) : normalizeAppConfig(asset);
    const config = applyLiveUrls(merged, liveUrls);
    this.configSignal.set(config);
    this.loadedSignal.set(true);
  }

  private getStoredConfig(): RawAppConfig | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as RawAppConfig;
    } catch {
      return null;
    }
  }

  private async loadAssetConfig(): Promise<RawAppConfig> {
    // cache: 'no-store' forces a real network request, bypassing the browser cache
    const url = `${CONFIG_ASSET}?v=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to load configuration: ${res.status}`);
    return (await res.json()) as RawAppConfig;
  }

  /**
   * Fragt die echten In-Cluster-URLs beim eigenen Backend ab (siehe `HubCatalogController`).
   * Läuft bewusst nie hart fehlschlagend: ohne Antwort/bei Fehlern bleiben die Dev-URLs aus
   * `konfiguration.json` unverändert (siehe `applyLiveUrls`).
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

  /** Update apps and persist them to localStorage. */
  saveApps(apps: AppEntry[]): void {
    const normalizedApps = normalizeAppConfig({
      defaultIcon: this.defaultIcon(),
      apps,
    }).apps;
    const next: AppConfig = {
      defaultIcon: this.defaultIcon(),
      apps: normalizedApps,
    };
    this.configSignal.set(next);
    this.loadedSignal.set(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      console.warn('ConfigService: localStorage.setItem failed', e);
    }
  }

  /** Reset stored configuration (falls back to the bundled asset again). */
  resetToAsset(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('ConfigService: localStorage.removeItem failed', e);
    }
    this.configSignal.set(null);
    this.loadedSignal.set(false);
    void this.load(true);
  }
}
