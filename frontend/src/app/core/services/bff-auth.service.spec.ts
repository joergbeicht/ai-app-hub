import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { BROWSER_NAVIGATION } from '../auth/browser-navigation';
import { BffSessionStore, type BffSession } from '../auth/bff-session.store';
import { RUNTIME_CONFIG, type RuntimeConfig } from '../runtime-config';
import { BffAuthService } from './bff-auth.service';

const BACKEND = 'https://backend.example.com';

const runtimeConfig: RuntimeConfig = {
  clusterName: 'test',
  azureTenantId: '',
  azureClientId: '',
  backendApiUrl: BACKEND,
  authMode: 'keycloak',
};

const session: BffSession = {
  user: {
    id: 'kc-user-1',
    displayName: 'Hub Administrator',
    email: 'admin@axora.local',
    roles: ['User', 'Administrator'],
  },
  csrfToken: 'csrf-token',
};

describe('BffAuthService', () => {
  let service: BffAuthService;
  let http: HttpTestingController;
  let navigateTo: jasmine.Spy<(url: string) => void>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    navigateTo = jasmine.createSpy('navigateTo');
    router = jasmine.createSpyObj<Router>('Router', ['navigateByUrl']);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: RUNTIME_CONFIG, useValue: runtimeConfig },
        { provide: BROWSER_NAVIGATION, useValue: navigateTo },
        { provide: Router, useValue: router },
      ],
    });
    service = TestBed.inject(BffAuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('restores an existing session and maps it to the hub user', async () => {
    const restored = service.restoreSession();
    http.expectOne(`${BACKEND}/auth/session`).flush(session);
    await restored;

    expect(service.isLoggedIn()).toBeTrue();
    expect(service.currentUser()).toEqual({
      id: 'kc-user-1',
      displayName: 'Hub Administrator',
      email: 'admin@axora.local',
      role: 'Administrator',
    });
  });

  it('stays logged out when the backend has no session', async () => {
    const restored = service.restoreSession();
    http
      .expectOne(`${BACKEND}/auth/session`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    await restored;

    expect(service.isLoggedIn()).toBeFalse();
  });

  it('starts the login as a full page navigation to the backend', () => {
    service.login();

    expect(navigateTo).toHaveBeenCalledWith(`${BACKEND}/auth/login?returnTo=%2F`);
  });

  it('redirects straight to Keycloak without an intermediate login page', () => {
    expect(service.redirectToLogin('/settings/apps')).toBeFalse();

    expect(navigateTo).toHaveBeenCalledWith(
      `${BACKEND}/auth/login?returnTo=%2Fsettings%2Fapps`,
    );
  });

  it('logs out at the backend first and then follows the Keycloak logout URL', () => {
    TestBed.inject(BffSessionStore).set(session);

    service.logout();
    http.expectOne({ method: 'POST', url: `${BACKEND}/auth/logout` }).flush({
      logoutUrl: 'https://keycloak.example/logout',
    });

    expect(service.isLoggedIn()).toBeFalse();
    expect(navigateTo).toHaveBeenCalledWith('https://keycloak.example/logout');
  });

  it('falls back to the login page when the backend logout fails', () => {
    TestBed.inject(BffSessionStore).set(session);

    service.logout();
    http
      .expectOne(`${BACKEND}/auth/logout`)
      .flush(null, { status: 500, statusText: 'Server Error' });

    expect(service.isLoggedIn()).toBeFalse();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  });
});
