import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TabletAuthService } from './tablet-auth.service';
import { RUNTIME_CONFIG } from '../runtime-config';

const backendApiUrl = 'https://backend.example.com';

const testResult = {
  sessionToken: 'session-token',
  deviceToken: 'device-token',
  expiresIn: 3600,
  displayName: 'Tablet User',
  userPrincipalName: 'tablet-user@axora.local',
  roles: ['User'],
};

describe('TabletAuthService', () => {
  let service: TabletAuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: RUNTIME_CONFIG,
          useValue: { clusterName: 'test', azureTenantId: 't', azureClientId: 'c', backendApiUrl },
        },
      ],
    });
    service = TestBed.inject(TabletAuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('logs in with a PIN and stores the resulting session + device token', () => {
    service.loginWithPin('TABLET-001', '1234').subscribe((session) => {
      expect(session.displayName).toBe('Tablet User');
    });

    const req = httpMock.expectOne(`${backendApiUrl}/tablet-auth/login`);
    expect(req.request.body).toEqual({ badgeCode: 'TABLET-001', pin: '1234' });
    req.flush(testResult);

    expect(service.session()?.userPrincipalName).toBe('tablet-user@axora.local');
    expect(localStorage.getItem('tabletDeviceToken:TABLET-001')).toBe('device-token');
  });

  it('returns null without an HTTP call when no device token is stored for this badge', () => {
    let emitted: unknown;
    service.tryRenewFromDeviceToken('UNKNOWN-BADGE').subscribe((session) => (emitted = session));

    expect(emitted).toBeNull();
    httpMock.expectNone(`${backendApiUrl}/tablet-auth/renew`);
  });

  it('renews a session from a stored device token without asking for a PIN', () => {
    localStorage.setItem('tabletDeviceToken:TABLET-001', 'stored-device-token');

    service.tryRenewFromDeviceToken('TABLET-001').subscribe((session) => {
      expect(session?.displayName).toBe('Tablet User');
    });

    const req = httpMock.expectOne(`${backendApiUrl}/tablet-auth/renew`);
    expect(req.request.body).toEqual({ deviceToken: 'stored-device-token' });
    req.flush(testResult);

    expect(service.session()).not.toBeNull();
  });

  it('clears the stored device token and returns null when renewal is rejected', () => {
    localStorage.setItem('tabletDeviceToken:TABLET-001', 'expired-device-token');

    let emitted: unknown = 'not-set';
    service.tryRenewFromDeviceToken('TABLET-001').subscribe((session) => (emitted = session));

    httpMock
      .expectOne(`${backendApiUrl}/tablet-auth/renew`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(emitted).toBeNull();
    expect(localStorage.getItem('tabletDeviceToken:TABLET-001')).toBeNull();
  });

  it('clears the in-memory session on logout but keeps the device token', () => {
    service.loginWithPin('TABLET-001', '1234').subscribe();
    httpMock.expectOne(`${backendApiUrl}/tablet-auth/login`).flush(testResult);

    service.logout();

    expect(service.session()).toBeNull();
    expect(localStorage.getItem('tabletDeviceToken:TABLET-001')).toBe('device-token');
  });
});
