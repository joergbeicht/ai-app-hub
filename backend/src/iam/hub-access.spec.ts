import type { IamMe, IamOrganization } from './iam-client.service';
import { resolveHubAccess } from './hub-access';

function organization(overrides: Partial<IamOrganization> = {}): IamOrganization {
  return {
    id: 'org-1',
    slug: 'axora',
    name: 'Axora',
    membershipStatus: 'ACTIVE',
    applications: ['ai-app-hub', 'iam'],
    permissions: ['hub.catalog.read', 'iam.user.read', 'crm.lead.read'],
    ...overrides,
  };
}

function me(...organizations: IamOrganization[]): IamMe {
  return { principal: { id: 'p-1', displayName: 'Ada', email: null }, organizations };
}

describe('resolveHubAccess', () => {
  it('grants the User role with catalog read and keeps only hub and IAM permissions', () => {
    expect(resolveHubAccess(me(organization()))).toEqual({
      organizationId: 'org-1',
      organizationName: 'Axora',
      permissions: ['hub.catalog.read', 'iam.user.read'],
      roles: ['User'],
    });
  });

  it('derives the Administrator role from catalog manage', () => {
    const access = resolveHubAccess(
      me(organization({ permissions: ['hub.catalog.read', 'hub.catalog.manage'] })),
    );

    expect(access?.roles).toEqual(['Administrator']);
  });

  it.each([
    ['without catalog read', { permissions: ['iam.user.read'] }],
    ['without hub entitlement', { applications: ['iam'] }],
    ['with a suspended membership', { membershipStatus: 'SUSPENDED' }],
  ])('denies access %s', (_label, overrides) => {
    expect(resolveHubAccess(me(organization(overrides)))).toBeNull();
  });

  it('denies access without any organization', () => {
    expect(resolveHubAccess(me())).toBeNull();
  });

  it('picks the first organization that grants the hub', () => {
    const access = resolveHubAccess(
      me(organization({ id: 'org-0', permissions: [] }), organization({ id: 'org-2' })),
    );

    expect(access?.organizationId).toBe('org-2');
  });

  it('never switches organizations silently for a running session', () => {
    const memberships = me(organization({ id: 'org-1', permissions: [] }), organization({ id: 'org-2' }));

    expect(resolveHubAccess(memberships, 'org-1')).toBeNull();
  });
});
