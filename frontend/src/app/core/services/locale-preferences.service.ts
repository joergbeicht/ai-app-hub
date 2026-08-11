import { Injectable, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import {
  APP_LOCALES,
  DEFAULT_APP_LOCALE,
  type AppLocale,
  isAppLocale,
} from '../models/locale.model';

const STORAGE_KEY = 'axora-app-hub-locale-preferences';

interface LocalePreferences {
  defaultLanguage: AppLocale;
}

/**
 * Persists hub UI preferences (default language) in localStorage
 * and applies them to Transloco.
 *
 * Preview vs persist:
 * - `previewLanguage` – UI only (immediate), no localStorage write
 * - `saveDefaultLanguage` – persist + apply (Save button)
 *
 * `activeLanguage` is the language currently shown in the UI (may be a
 * preview). Bind it in OnPush templates so lang switches re-render
 * everywhere, including inactive Material tabs.
 */
@Injectable({ providedIn: 'root' })
export class LocalePreferencesService {
  private readonly transloco = inject(TranslocoService);

  private readonly _defaultLanguage = signal<AppLocale>(this.readFromStorage().defaultLanguage);
  private readonly _activeLanguage = signal<AppLocale>(this._defaultLanguage());

  readonly defaultLanguage = this._defaultLanguage.asReadonly();
  /** Currently applied UI language (persisted or preview). */
  readonly activeLanguage = this._activeLanguage.asReadonly();
  readonly availableLocales = APP_LOCALES;

  /** Apply the stored default language at app startup. */
  init(): void {
    this.applyLanguage(this._defaultLanguage());
  }

  /** Immediate UI language change without persisting. */
  previewLanguage(locale: AppLocale): void {
    this.applyLanguage(locale);
  }

  /** Persist as default and apply (Save). */
  saveDefaultLanguage(locale: AppLocale): void {
    this._defaultLanguage.set(locale);
    this.persist({ defaultLanguage: locale });
    this.applyLanguage(locale);
  }

  /** Revert UI to the last persisted default (e.g. cancel / leave without save). */
  restorePersistedLanguage(): void {
    this.applyLanguage(this._defaultLanguage());
  }

  private applyLanguage(locale: AppLocale): void {
    this._activeLanguage.set(locale);
    this.transloco.setActiveLang(locale);
  }

  private readFromStorage(): LocalePreferences {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return { defaultLanguage: DEFAULT_APP_LOCALE };
      }
      const parsed = JSON.parse(raw) as Partial<LocalePreferences>;
      if (isAppLocale(parsed.defaultLanguage)) {
        return { defaultLanguage: parsed.defaultLanguage };
      }
      return { defaultLanguage: DEFAULT_APP_LOCALE };
    } catch {
      return { defaultLanguage: DEFAULT_APP_LOCALE };
    }
  }

  private persist(prefs: LocalePreferences): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch (e) {
      console.warn('LocalePreferencesService: localStorage.setItem failed', e);
    }
  }
}
