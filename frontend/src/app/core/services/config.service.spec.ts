import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ConfigService } from './config.service';
import type { RawHubAppContent } from '../models/app-config.model';
import { RUNTIME_CONFIG } from '../runtime-config';

const STORAGE_KEY = 'app-hub-personal-preferences';
const BACKEND_API_URL = 'https://backend.example.com';

const catalogContent: RawHubAppContent[] = [
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
    sortOrder: 0,
  },
  {
    id: 'ai-notizen',
    name: { de: 'AI Notizen', en: 'AI Notes', es: '', fr: '', tr: '', it: '' },
    description: { de: '', en: '', es: '', fr: '', tr: '', it: '' },
    url: 'https://localhost:6210/notes',
    iconType: 'mat-icon',
    icon: 'mic',
    sortOrder: 1,
  },
];

describe('ConfigService', () => {
  let service: ConfigService;
  let httpMock: HttpTestingController;
  let fetchSpy: jasmine.Spy;
  let liveUrls: Record<string, string>;

  /** Answers the pending `GET /hub-apps` request and the `GET /hub-catalog-urls` fetch call. */
  function flushCatalog(content: RawHubAppContent[] = catalogContent): void {
    httpMock.expectOne(`${BACKEND_API_URL}/hub-apps`).flush(content);
  }

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    liveUrls = {};
    fetchSpy = spyOn(window, 'fetch').and.callFake(() =>
      Promise.resolve(new Response(JSON.stringify(liveUrls), { status: 200 })),
    );
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
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
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    httpMock.verify();
  });

  it('loads the catalog from the backend and exposes it as apps/visibleApps', async () => {
    const pending = service.load();
    flushCatalog();
    await pending;

    expect(fetchSpy).toHaveBeenCalled();
    expect(service.loaded()).toBe(true);
    expect(service.apps().map((app) => app.id)).toEqual(['ai-analytics', 'ai-notizen']);
    expect(service.visibleApps().map((app) => app.id)).toEqual(['ai-analytics', 'ai-notizen']);
    expect(service.apps()[0].name.en).toBe('AI Analytics EN');
    expect(service.defaultIcon()).toBe('apps');
  });

  it('overrides the catalog URL with the real cluster URL when the backend knows it', async () => {
    liveUrls = { 'ai-analytics': 'https://confessio-test.westeurope.cloudapp.azure.com/analytics' };

    const pending = service.load();
    flushCatalog();
    await pending;

    expect(service.apps()[0].url).toBe(liveUrls['ai-analytics']);
  });

  it('keeps the catalog URL when the backend has no live URL for an app', async () => {
    const pending = service.load();
    flushCatalog();
    await pending;

    expect(service.apps()[0].url).toBe(catalogContent[0].url);
  });

  it('does not refetch when already loaded unless forced', async () => {
    const first = service.load();
    flushCatalog();
    await first;
    fetchSpy.calls.reset();

    await service.load();
    httpMock.expectNone(`${BACKEND_API_URL}/hub-apps`);
    expect(fetchSpy).not.toHaveBeenCalled();

    const forced = service.load(true);
    flushCatalog();
    await forced;
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('applies a stored personal order/visibility preference on top of the catalog', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ order: ['ai-notizen', 'ai-analytics'], disabledIds: ['ai-analytics'] }),
    );

    const pending = service.load();
    flushCatalog();
    await pending;

    expect(service.apps().map((app) => app.id)).toEqual(['ai-notizen', 'ai-analytics']);
    expect(service.visibleApps().map((app) => app.id)).toEqual(['ai-notizen']);
  });

  it('appends catalog apps that are missing from a stale stored order', async () => {
    // Regression: a new app added to the central catalog after the last personal reorder must
    // still show up on the hub instead of silently disappearing (see `applyPersonalPreferences`).
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ order: ['ai-analytics'], disabledIds: [] }));

    const pending = service.load();
    flushCatalog();
    await pending;

    expect(service.apps().map((app) => app.id)).toEqual(['ai-analytics', 'ai-notizen']);
  });

  it('savePersonalPreferences persists order/visibility to localStorage without touching the catalog', async () => {
    const pending = service.load();
    flushCatalog();
    await pending;

    const reordered = [...service.apps()].reverse().map((app, i) => ({ ...app, enabled: i !== 0 }));
    service.savePersonalPreferences(reordered);

    expect(service.apps().map((app) => app.id)).toEqual(['ai-notizen', 'ai-analytics']);
    expect(service.visibleApps().map((app) => app.id)).toEqual(['ai-analytics']);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    expect(stored).toEqual({ order: ['ai-notizen', 'ai-analytics'], disabledIds: ['ai-notizen'] });
    httpMock.expectNone(`${BACKEND_API_URL}/hub-apps`);
  });

  it('resetPersonalPreferences clears localStorage and falls back to catalog order, all enabled', async () => {
    const pending = service.load();
    flushCatalog();
    await pending;

    service.savePersonalPreferences([...service.apps()].reverse());
    service.resetPersonalPreferences();

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(service.apps().map((app) => app.id)).toEqual(['ai-analytics', 'ai-notizen']);
    expect(service.visibleApps().map((app) => app.id)).toEqual(['ai-analytics', 'ai-notizen']);
  });

  it('saveCentralCatalog PUTs content only (no enabled) and updates the catalog from the response', async () => {
    const pending = service.load();
    flushCatalog();
    await pending;

    const edited = service.apps().map((app) => ({ ...app, url: `${app.url}?edited` }));
    const savePromise = service.saveCentralCatalog(edited);

    const req = httpMock.expectOne(`${BACKEND_API_URL}/hub-apps`);
    expect(req.request.method).toBe('PUT');
    expect(Object.keys(req.request.body.apps[0])).not.toContain('enabled');
    expect(req.request.body.apps[0].url).toBe('http://localhost:4200?edited');
    const responseContent = catalogContent.map((app) => ({ ...app, url: `${app.url}?edited` }));
    req.flush(responseContent);
    await savePromise;

    expect(service.apps()[0].url).toBe('http://localhost:4200?edited');
  });
});
