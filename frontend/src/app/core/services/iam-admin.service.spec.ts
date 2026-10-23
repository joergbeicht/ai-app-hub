import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BffSessionStore, type BffSession } from '../auth/bff-session.store';
import { RUNTIME_CONFIG, type RuntimeConfig } from '../runtime-config';
import { IamAccessService } from './iam-access.service';
import { IamAdminService } from './iam-admin.service';

const BACKEND = 'https://backend.example.com';
const ORG_URL = `${BACKEND}/iam/v1/organizations/org-1`;

const runtimeConfig: RuntimeConfig = {
  clusterName: 'test',
  azureTenantId: '',
  azureClientId: '',
  backendApiUrl: BACKEND,
  authMode: 'keycloak',
};

const session: BffSession = {
  user: { id: 'kc-1', displayName: 'Ada', email: 'Ada@axora.local', roles: ['User'] },
  organization: { id: 'org-1', name: 'Axora' },
  permissions: ['hub.catalog.read', 'iam.user.read'],
  csrfToken: 'csrf',
  accountSecurityUrl: 'https://keycloak.example/realms/axora/account/account-security/signing-in',
};

describe('IAM services', () => {
  let store: BffSessionStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: RUNTIME_CONFIG, useValue: runtimeConfig },
      ],
    });
    store = TestBed.inject(BffSessionStore);
  });

  describe('IamAccessService', () => {
    it('grants only the permissions of the session', () => {
      store.set(session);
      const access = TestBed.inject(IamAccessService);

      expect(access.can('iam.user.read')).toBeTrue();
      expect(access.can('iam.user.manage')).toBeFalse();
      expect(access.organization()).toEqual({ id: 'org-1', name: 'Axora' });
    });

    it('denies everything without a session (Entra mode)', () => {
      const access = TestBed.inject(IamAccessService);

      expect(access.can('iam.user.read')).toBeFalse();
      expect(access.organization()).toBeNull();
    });

    it('recognizes the current user by email, case-insensitively', () => {
      store.set(session);
      const access = TestBed.inject(IamAccessService);

      expect(access.isCurrentUser('ada@AXORA.local')).toBeTrue();
      expect(access.isCurrentUser('bob@axora.local')).toBeFalse();
      expect(access.isCurrentUser(null)).toBeFalse();
    });
  });

  describe('IamAdminService', () => {
    let http: HttpTestingController;
    let service: IamAdminService;

    beforeEach(() => {
      store.set(session);
      http = TestBed.inject(HttpTestingController);
      service = TestBed.inject(IamAdminService);
    });

    afterEach(() => http.verify());

    it('scopes every call to the organization of the session', () => {
      service.listUsers(' ada ').subscribe();
      service.listGroups().subscribe();
      service.listRoleAssignments().subscribe();

      expect(http.expectOne(`${ORG_URL}/users?q=ada`).request.method).toBe('GET');
      http.expectOne(`${ORG_URL}/groups`);
      http.expectOne(`${ORG_URL}/role-assignments`);
    });

    it('omits the query parameter for an empty search', () => {
      service.listUsers('  ').subscribe();

      http.expectOne(`${ORG_URL}/users`);
    });

    it('sends invitations, memberships and role assignments to the IAM proxy', () => {
      service.inviteUser({ email: 'bob@axora.local', firstName: 'Bob', lastName: 'B' }).subscribe();
      service.addGroupMember('g-1', 'p-2').subscribe();
      service.assignRole({ roleId: 'r-1', groupId: 'g-1' }).subscribe();
      service.revokeRoleAssignment('a-1').subscribe();

      expect(http.expectOne(`${ORG_URL}/users/invitations`).request.body).toEqual({
        email: 'bob@axora.local',
        firstName: 'Bob',
        lastName: 'B',
      });
      expect(http.expectOne(`${ORG_URL}/groups/g-1/members`).request.body).toEqual({
        principalId: 'p-2',
      });
      expect(http.expectOne(`${ORG_URL}/role-assignments`).request.body).toEqual({
        roleId: 'r-1',
        groupId: 'g-1',
      });
      expect(http.expectOne(`${ORG_URL}/role-assignments/a-1`).request.method).toBe('DELETE');
    });

    it('refuses to call the IAM without an organization', () => {
      store.clear();

      expect(() => service.listGroups()).toThrowError(/No Axora organization/);
    });
  });
});
