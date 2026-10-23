import type { IamMe, IamOrganization } from './iam-client.service';

/** App-Schlüssel des Hubs im Axora-IAM-Katalog. */
export const HUB_APPLICATION_KEY = 'ai-app-hub';

export const HUB_PERMISSIONS = {
  catalogRead: 'hub.catalog.read',
  catalogManage: 'hub.catalog.manage',
} as const;

/** Nur diese Permissions braucht der Hub (eigene App und IAM-Verwaltung); der Rest bleibt in der IAM. */
const RELEVANT_PERMISSION_PREFIXES = ['hub.', 'iam.'] as const;

const ACTIVE_MEMBERSHIP = 'ACTIVE';

const HUB_ROLES = ['Administrator', 'User'] as const;

export type HubRole = (typeof HUB_ROLES)[number];

export function isHubRole(value: string): value is HubRole {
  return HUB_ROLES.some((role) => role === value);
}

export interface HubAccess {
  organizationId: string;
  organizationName: string;
  permissions: string[];
  /** Für die bestehenden `@Roles(...)`-Prüfungen, abgeleitet aus den Permissions. */
  roles: HubRole[];
}

/**
 * Leitet aus `GET /me` den Zugriff auf den Hub ab (Default Deny): aktive Mitgliedschaft, gültiges
 * Entitlement für `ai-app-hub` und `hub.catalog.read`. Ist `organizationId` gesetzt (laufende
 * Sitzung), zählt nur diese Organisation - ein stiller Wechsel der Organisation findet nicht statt.
 */
export function resolveHubAccess(me: IamMe, organizationId?: string): HubAccess | null {
  const organization = me.organizations.find(
    (candidate) =>
      (organizationId === undefined || candidate.id === organizationId) && grantsHub(candidate),
  );
  if (!organization) {
    return null;
  }
  const permissions = organization.permissions.filter((permission) =>
    RELEVANT_PERMISSION_PREFIXES.some((prefix) => permission.startsWith(prefix)),
  );
  return {
    organizationId: organization.id,
    organizationName: organization.name,
    permissions,
    roles: [permissions.includes(HUB_PERMISSIONS.catalogManage) ? 'Administrator' : 'User'],
  };
}

function grantsHub(organization: IamOrganization): boolean {
  return (
    organization.membershipStatus === ACTIVE_MEMBERSHIP &&
    organization.applications.includes(HUB_APPLICATION_KEY) &&
    organization.permissions.includes(HUB_PERMISSIONS.catalogRead)
  );
}
