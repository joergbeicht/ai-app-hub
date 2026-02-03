import { Injectable, signal, computed } from '@angular/core';
import type { AppConfig, AppEntry } from '../models/app-config.model';

const CONFIG_ASSET = 'assets/konfiguration.json';
const STORAGE_KEY = 'app-hub-config';

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly configSignal = signal<AppConfig | null>(null);
  private readonly loadedSignal = signal<boolean>(false);

  readonly apps = computed(() => this.configSignal()?.apps ?? []);
  readonly defaultIcon = computed(() => this.configSignal()?.defaultIcon ?? 'apps');
  readonly loaded = this.loadedSignal.asReadonly();

  constructor() {}

  /** Konfiguration laden: zuerst aus localStorage (falls vorhanden), sonst aus assets. */
  async load(): Promise<void> {
    const stored = this.getStoredConfig();
    if (stored) {
      this.configSignal.set(stored);
      this.loadedSignal.set(true);
      return;
    }
    const asset = await this.loadAssetConfig();
    this.configSignal.set(asset);
    this.loadedSignal.set(true);
  }

  private getStoredConfig(): AppConfig | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as AppConfig;
    } catch {
      return null;
    }
  }

  private async loadAssetConfig(): Promise<AppConfig> {
    // fetch mit cache: 'no-store' – erzwingt echte Netzwerkanfrage, kein Browser-Cache
    const url = `${CONFIG_ASSET}?v=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Konfiguration nicht geladen: ${res.status}`);
    return (await res.json()) as AppConfig;
  }

  /** Apps aktualisieren und in localStorage speichern. */
  saveApps(apps: AppEntry[]): void {
    const current = this.configSignal();
    if (!current) return;
    const next: AppConfig = { ...current, apps };
    this.configSignal.set(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      console.warn('ConfigService: localStorage.setItem fehlgeschlagen', e);
    }
  }

  /** Gespeicherte Konfiguration zurücksetzen (nur Asset wieder verwenden). */
  resetToAsset(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    this.configSignal.set(null);
    this.loadedSignal.set(false);
    void this.load();
  }
}
