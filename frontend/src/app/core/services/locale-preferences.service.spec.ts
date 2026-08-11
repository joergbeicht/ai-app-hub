import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { LocalePreferencesService } from './locale-preferences.service';

const STORAGE_KEY = 'axora-app-hub-locale-preferences';

describe('LocalePreferencesService', () => {
  let service: LocalePreferencesService;
  let setActiveLang: jasmine.Spy;

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    setActiveLang = jasmine.createSpy('setActiveLang');
    TestBed.configureTestingModule({
      providers: [
        LocalePreferencesService,
        { provide: TranslocoService, useValue: { setActiveLang } },
      ],
    });
    service = TestBed.inject(LocalePreferencesService);
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it('defaults to German when nothing is stored', () => {
    expect(service.defaultLanguage()).toBe('de');
  });

  it('previews a language without writing localStorage', () => {
    service.previewLanguage('fr');

    expect(setActiveLang).toHaveBeenCalledWith('fr');
    expect(service.activeLanguage()).toBe('fr');
    expect(service.defaultLanguage()).toBe('de');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('persists and applies a selected language on save', () => {
    service.saveDefaultLanguage('fr');

    expect(service.defaultLanguage()).toBe('fr');
    expect(setActiveLang).toHaveBeenCalledWith('fr');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').defaultLanguage).toBe('fr');
  });

  it('restores the persisted language after a preview', () => {
    service.saveDefaultLanguage('en');
    setActiveLang.calls.reset();

    service.previewLanguage('es');
    service.restorePersistedLanguage();

    expect(setActiveLang).toHaveBeenCalledWith('en');
    expect(service.defaultLanguage()).toBe('en');
  });

  it('restores a stored language on init', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ defaultLanguage: 'es' }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        LocalePreferencesService,
        { provide: TranslocoService, useValue: { setActiveLang } },
      ],
    });

    const restored = TestBed.inject(LocalePreferencesService);
    restored.init();

    expect(restored.defaultLanguage()).toBe('es');
    expect(setActiveLang).toHaveBeenCalledWith('es');
  });
});
