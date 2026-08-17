import { TestBed } from '@angular/core/testing';
import { ConfigService } from './config.service';
import {
  normalizeAppConfig,
  type AppConfig,
  type AppEntry,
  type RawAppConfig,
} from '../models/app-config.model';
import { RUNTIME_CONFIG } from '../runtime-config';

const STORAGE_KEY = 'app-hub-config';
const BACKEND_API_URL = 'https://backend.example.com';

const assetConfig: RawAppConfig = {
  defaultIcon: 'apps',
  apps: [
    {
      id: 'ai-analytics',
      name: {
        de: 'AI Analytics',
        en: 'AI Analytics EN',
        es: 'AI Analytics ES',
        fr: 'AI Analytics FR',
        tr: 'AI Analytics TR',
        it: 'AI Analytics IT',
      },
      description: {
        de: 'Analytics DE',
        en: 'Analytics EN',
        es: 'Analytics ES',
        fr: 'Analytics FR',
        tr: 'Analytics TR',
        it: 'Analytics IT',
      },
      url: 'http://localhost:4200',
      iconType: 'mat-icon',
      icon: 'insights',
    },
  ],
};

describe('ConfigService', () => {
  let service: ConfigService;
  let fetchSpy: jasmine.Spy;
  let liveUrls: Record<string, string>;

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    liveUrls = {};
    fetchSpy = spyOn(window, 'fetch').and.callFake((input: unknown) => {
      const href = typeof input === 'string' ? input : (input as Request).url;
      if (href.includes('hub-catalog-urls')) {
        return Promise.resolve(new Response(JSON.stringify(liveUrls), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify(assetConfig), { status: 200 }));
    });
    TestBed.configureTestingModule({
      providers: [
        {
          provide: RUNTIME_CONFIG,
          useValue: {
            clusterName: 'test',
            azureTenantId: 't',
            azureClientId: 'c',
            backendApiUrl: BACKEND_API_URL,
          },
        },
      ],
    });
    service = TestBed.inject(ConfigService);
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it('loads and normalizes the bundled asset config when nothing is stored', async () => {
    await service.load();

    expect(fetchSpy).toHaveBeenCalled();
    expect(service.loaded()).toBe(true);
    expect(service.apps()).toEqual(normalizeAppConfig(assetConfig).apps);
    expect(service.defaultIcon()).toBe('apps');
  });

  it('overrides the dev URL with the real cluster URL when the backend knows it', async () => {
    liveUrls = { 'ai-analytics': 'https://confessio-test.westeurope.cloudapp.azure.com/analytics' };

    await service.load();

    expect(
      fetchSpy.calls.allArgs().some((args) => String(args[0]).includes('hub-catalog-urls')),
    ).toBe(true);
    expect(service.apps()[0].url).toBe(liveUrls['ai-analytics']);
  });

  it('keeps the bundled dev URL when the backend has no live URL for an app', async () => {
    liveUrls = {};

    await service.load();

    expect(service.apps()[0].url).toBe(assetConfig.apps![0].url);
  });

  it('does not refetch when already loaded unless forced', async () => {
    await service.load();
    fetchSpy.calls.reset();

    await service.load();
    expect(fetchSpy).not.toHaveBeenCalled();

    await service.load(true);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('merges stored legacy strings with asset translations', async () => {
    const storedConfig: RawAppConfig = {
      defaultIcon: 'star',
      apps: [
        {
          id: 'ai-analytics',
          name: 'Custom DE name',
          description: 'Custom DE description',
          url: 'http://localhost:9999',
          iconType: 'mat-icon',
          icon: 'insights',
        },
      ],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storedConfig));

    await service.load();

    expect(fetchSpy).toHaveBeenCalled();
    expect(service.defaultIcon()).toBe('star');
    expect(service.apps()[0].url).toBe('http://localhost:9999');
    expect(service.apps()[0].name.de).toBe('Custom DE name');
    expect(service.apps()[0].name.en).toBe('AI Analytics EN');
    expect(service.apps()[0].description.en).toBe('Analytics EN');
  });

  it('overrides even a stored (localStorage) URL with the live cluster URL', async () => {
    // Regression test: a past Settings edit (or any stored override) must never keep a stale
    // dev URL alive once Kubernetes reports the real one - see `ConfigService.load`.
    const storedConfig: RawAppConfig = {
      apps: [
        {
          id: 'ai-analytics',
          name: 'Custom name',
          description: 'Custom description',
          url: 'http://localhost:9999',
          iconType: 'mat-icon',
          icon: 'insights',
        },
      ],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storedConfig));
    liveUrls = { 'ai-analytics': 'https://confessio-test.westeurope.cloudapp.azure.com/analytics' };

    await service.load();

    expect(service.apps()[0].url).toBe(liveUrls['ai-analytics']);
  });

  it('exposes only enabled apps as visibleApps', async () => {
    await service.load();
    service.saveApps([
      {
        id: 'visible',
        name: { de: 'Visible', en: '', es: '', fr: '', tr: '', it: '' },
        description: { de: '', en: '', es: '', fr: '', tr: '', it: '' },
        url: 'http://localhost:1',
        iconType: 'mat-icon',
        icon: 'apps',
        enabled: true,
      },
      {
        id: 'hidden',
        name: { de: 'Hidden', en: '', es: '', fr: '', tr: '', it: '' },
        description: { de: '', en: '', es: '', fr: '', tr: '', it: '' },
        url: 'http://localhost:2',
        iconType: 'mat-icon',
        icon: 'apps',
        enabled: false,
      },
    ]);

    expect(service.apps().map((app) => app.id)).toEqual(['visible', 'hidden']);
    expect(service.visibleApps().map((app) => app.id)).toEqual(['visible']);
  });

  it('persists saved apps to localStorage', async () => {
    await service.load();
    const updatedApps: AppEntry[] = [
      {
        id: 'new-app',
        name: { de: 'New App', en: '', es: '', fr: '', tr: '', it: '' },
        description: { de: '', en: '', es: '', fr: '', tr: '', it: '' },
        url: '',
        iconType: 'mat-icon',
        icon: 'apps',
        enabled: true,
      },
    ];

    service.saveApps(updatedApps);

    expect(service.apps()).toEqual(updatedApps);
    expect(service.visibleApps()).toEqual(updatedApps);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as AppConfig;
    expect(stored.apps).toEqual(updatedApps);
  });

  it('resets to the bundled asset and clears localStorage', async () => {
    await service.load();
    service.saveApps([]);

    service.resetToAsset();
    await Promise.resolve();

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
