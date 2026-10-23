import { TestBed } from '@angular/core/testing';
import {
  HTTP_INTERCEPTORS,
  HttpClient,
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { RUNTIME_CONFIG } from '../runtime-config';
import { BffSessionInterceptor } from './bff-session.interceptor';
import { BffSessionStore, type BffSession } from './bff-session.store';

const BACKEND = 'https://backend.example.com';

const session: BffSession = {
  user: { id: 'u1', displayName: 'Hub Admin', email: null, roles: ['Administrator'] },
  organization: { id: 'org-1', name: 'Axora' },
  permissions: [],
  csrfToken: 'csrf-token',
  accountSecurityUrl: 'https://keycloak.example/realms/axora/account/account-security/signing-in',
};

describe('BffSessionInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let store: BffSessionStore;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        { provide: HTTP_INTERCEPTORS, useClass: BffSessionInterceptor, multi: true },
        { provide: RUNTIME_CONFIG, useValue: { backendApiUrl: BACKEND } },
        { provide: Router, useValue: router },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    store = TestBed.inject(BffSessionStore);
  });

  afterEach(() => backend.verify());

  it('sends the session cookie without CSRF header on reads', () => {
    store.set(session);

    http.get(`${BACKEND}/hub-apps`).subscribe();

    const request = backend.expectOne(`${BACKEND}/hub-apps`).request;
    expect(request.withCredentials).toBeTrue();
    expect(request.headers.has('X-CSRF-Token')).toBeFalse();
  });

  it('adds the CSRF token on writes', () => {
    store.set(session);

    http.put(`${BACKEND}/hub-apps`, {}).subscribe();

    const request = backend.expectOne(`${BACKEND}/hub-apps`).request;
    expect(request.withCredentials).toBeTrue();
    expect(request.headers.get('X-CSRF-Token')).toBe('csrf-token');
  });

  it('leaves requests to other origins untouched', () => {
    store.set(session);

    http.post('/assets/data.json', {}).subscribe();

    const request = backend.expectOne('/assets/data.json').request;
    expect(request.withCredentials).toBeFalse();
    expect(request.headers.has('X-CSRF-Token')).toBeFalse();
  });

  it('returns to the login page when an active session expires', () => {
    store.set(session);

    http.get(`${BACKEND}/hub-apps`).subscribe({ error: () => undefined });
    backend.expectOne(`${BACKEND}/hub-apps`).flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(store.session()).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { error: 'session_expired' },
    });
  });

  it('does not redirect on 401 without a session (initial session restore)', () => {
    http.get(`${BACKEND}/auth/session`).subscribe({ error: () => undefined });
    backend.expectOne(`${BACKEND}/auth/session`).flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(router.navigate).not.toHaveBeenCalled();
  });
});
