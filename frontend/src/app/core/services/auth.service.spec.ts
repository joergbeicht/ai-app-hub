import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MsalBroadcastService, MsalService } from '@azure/msal-angular';
import type { AccountInfo, EventMessage, IPublicClientApplication } from '@azure/msal-browser';
import { EventType, InteractionStatus } from '@azure/msal-browser';
import { Subject } from 'rxjs';
import { AuthService } from './auth.service';
import { TabletAuthService } from './tablet-auth.service';
import { RUNTIME_CONFIG } from '../runtime-config';

const testRuntimeConfig = {
  clusterName: 'test',
  azureTenantId: 'tenant-1',
  azureClientId: 'client-1',
  backendApiUrl: 'https://backend.example.com',
};

const testAccount = {
  homeAccountId: 'home-1',
  username: 'sam.nutzer@axora.local',
  name: 'Sam Nutzer',
  idTokenClaims: { roles: ['User'] },
} as AccountInfo;

describe('AuthService', () => {
  let msalServiceSpy: jasmine.SpyObj<MsalService>;
  let msalSubject$: Subject<EventMessage>;
  let inProgress$: Subject<InteractionStatus>;

  function configure(
    activeAccount: AccountInfo | null,
    allAccounts: AccountInfo[] = [],
  ): AuthService {
    msalSubject$ = new Subject();
    inProgress$ = new Subject();
    let activeAccountRef = activeAccount;
    msalServiceSpy = jasmine.createSpyObj<MsalService>('MsalService', [
      'loginRedirect',
      'logoutRedirect',
    ]);
    msalServiceSpy.instance = {
      getActiveAccount: () => activeAccountRef,
      getAllAccounts: () => allAccounts,
      setActiveAccount: jasmine
        .createSpy('setActiveAccount')
        .and.callFake((account: AccountInfo) => {
          activeAccountRef = account;
        }),
    } as unknown as IPublicClientApplication;

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MsalService, useValue: msalServiceSpy },
        { provide: MsalBroadcastService, useValue: { msalSubject$, inProgress$ } },
        { provide: RUNTIME_CONFIG, useValue: testRuntimeConfig },
      ],
    });

    return TestBed.inject(AuthService);
  }

  it('starts logged out when there is no account', () => {
    const service = configure(null);

    expect(service.isLoggedIn()).toBe(false);
    expect(service.currentUser()).toBeNull();
  });

  it('maps the active account to a HubUser, including the roles claim', () => {
    const service = configure(testAccount);

    expect(service.isLoggedIn()).toBe(true);
    expect(service.currentUser()).toEqual({
      id: 'home-1',
      displayName: 'Sam Nutzer',
      email: 'sam.nutzer@axora.local',
      role: 'User',
    });
  });

  it('falls back to "Guest" when no App Role is assigned in Azure yet', () => {
    const service = configure({ ...testAccount, idTokenClaims: {} } as AccountInfo);

    expect(service.currentUser()?.role).toBe('Guest');
  });

  it('delegates login() to msalService.loginRedirect() with the backend API scope', () => {
    const service = configure(null);

    service.login();

    expect(msalServiceSpy.loginRedirect).toHaveBeenCalledWith({
      scopes: ['openid', 'profile', 'api://client-1/access_as_user'],
    });
  });

  it('delegates logout() to msalService.logoutRedirect()', () => {
    const service = configure(testAccount);

    service.logout();

    expect(msalServiceSpy.logoutRedirect).toHaveBeenCalled();
  });

  it('sets the active account on LOGIN_SUCCESS', () => {
    configure(null);

    msalSubject$.next({
      eventType: EventType.LOGIN_SUCCESS,
      payload: { account: testAccount },
    } as unknown as EventMessage);

    expect(msalServiceSpy.instance.setActiveAccount).toHaveBeenCalledWith(testAccount);
  });

  it('re-syncs currentUser once an interaction completes', () => {
    const service = configure(null);
    expect(service.currentUser()).toBeNull();

    msalServiceSpy.instance.setActiveAccount(testAccount);
    inProgress$.next(InteractionStatus.None);

    expect(service.currentUser()?.displayName).toBe('Sam Nutzer');
  });

  it('prefers an active tablet session over an MSAL account (see ADR-12)', () => {
    const service = configure(testAccount);
    const tabletAuthService = TestBed.inject(TabletAuthService);
    const httpMock = TestBed.inject(HttpTestingController);

    tabletAuthService.loginWithPin('TABLET-001', '1234').subscribe();
    httpMock.expectOne(`${testRuntimeConfig.backendApiUrl}/tablet-auth/login`).flush({
      sessionToken: 'session-token',
      deviceToken: 'device-token',
      expiresIn: 3600,
      displayName: 'Tablet User',
      userPrincipalName: 'tablet-user@axora.local',
      roles: ['User'],
    });

    expect(service.currentUser()).toEqual({
      id: 'tablet-user@axora.local',
      displayName: 'Tablet User',
      email: 'tablet-user@axora.local',
      role: 'User',
    });
    httpMock.verify();
    localStorage.removeItem('tabletDeviceToken:TABLET-001');
  });

  it('logs a tablet session out locally instead of redirecting to Entra', () => {
    const service = configure(null);
    const tabletAuthService = TestBed.inject(TabletAuthService);
    const httpMock = TestBed.inject(HttpTestingController);

    tabletAuthService.loginWithPin('TABLET-001', '1234').subscribe();
    httpMock.expectOne(`${testRuntimeConfig.backendApiUrl}/tablet-auth/login`).flush({
      sessionToken: 'session-token',
      deviceToken: 'device-token',
      expiresIn: 3600,
      displayName: 'Tablet User',
      userPrincipalName: 'tablet-user@axora.local',
      roles: ['User'],
    });
    expect(service.isLoggedIn()).toBe(true);

    service.logout();

    expect(service.isLoggedIn()).toBe(false);
    expect(msalServiceSpy.logoutRedirect).not.toHaveBeenCalled();
    httpMock.verify();
    localStorage.removeItem('tabletDeviceToken:TABLET-001');
  });
});
