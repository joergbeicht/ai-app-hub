import { TestBed } from '@angular/core/testing';
import { MsalBroadcastService, MsalService } from '@azure/msal-angular';
import type { AccountInfo, EventMessage, IPublicClientApplication } from '@azure/msal-browser';
import { EventType, InteractionStatus } from '@azure/msal-browser';
import { Subject } from 'rxjs';
import { AuthService } from './auth.service';
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

  function configure(activeAccount: AccountInfo | null, allAccounts: AccountInfo[] = []): AuthService {
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
      setActiveAccount: jasmine.createSpy('setActiveAccount').and.callFake((account: AccountInfo) => {
        activeAccountRef = account;
      }),
    } as unknown as IPublicClientApplication;

    TestBed.configureTestingModule({
      providers: [
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
});
