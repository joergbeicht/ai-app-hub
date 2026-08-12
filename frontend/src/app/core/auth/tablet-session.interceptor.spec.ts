import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  HTTP_INTERCEPTORS,
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TabletSessionInterceptor } from './tablet-session.interceptor';
import { TabletAuthService } from '../services/tablet-auth.service';
import { RUNTIME_CONFIG } from '../runtime-config';

const backendApiUrl = 'https://backend.example.com';

describe('TabletSessionInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;
  let tabletAuthService: TabletAuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        { provide: HTTP_INTERCEPTORS, useClass: TabletSessionInterceptor, multi: true },
        {
          provide: RUNTIME_CONFIG,
          useValue: { clusterName: 'test', azureTenantId: 't', azureClientId: 'c', backendApiUrl },
        },
      ],
    });
    httpClient = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    tabletAuthService = TestBed.inject(TabletAuthService);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('does not add an Authorization header without an active tablet session', () => {
    httpClient.get(`${backendApiUrl}/users`).subscribe();

    const req = httpMock.expectOne(`${backendApiUrl}/users`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush([]);
  });

  it('adds the session token once a tablet session is active', () => {
    tabletAuthService.loginWithPin('TABLET-001', '1234').subscribe();
    httpMock.expectOne(`${backendApiUrl}/tablet-auth/login`).flush({
      sessionToken: 'session-token',
      deviceToken: 'device-token',
      expiresIn: 3600,
      displayName: 'Tablet User',
      userPrincipalName: 'tablet-user@axora.local',
      roles: ['User'],
    });

    httpClient.get(`${backendApiUrl}/users`).subscribe();

    const req = httpMock.expectOne(`${backendApiUrl}/users`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer session-token');
    req.flush([]);
    localStorage.removeItem('tabletDeviceToken:TABLET-001');
  });

  it('never attaches the session token to the tablet-auth endpoints themselves', () => {
    tabletAuthService.loginWithPin('TABLET-001', '1234').subscribe();
    const loginReq = httpMock.expectOne(`${backendApiUrl}/tablet-auth/login`);
    expect(loginReq.request.headers.has('Authorization')).toBe(false);
    loginReq.flush({
      sessionToken: 'session-token',
      deviceToken: 'device-token',
      expiresIn: 3600,
      displayName: 'Tablet User',
      userPrincipalName: 'tablet-user@axora.local',
      roles: ['User'],
    });
    localStorage.removeItem('tabletDeviceToken:TABLET-001');
  });
});
