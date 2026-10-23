/**
 * Microsoft-Graph-Bausteine rund um "eine App-Registrierung anlegen" - gemeinsam genutzt von
 * `provision-customer-tenant.ts` (bootstrapt `ai-app-hub` selbst für einen neuen Kunden-Tenant) und
 * `provision-app-registration.ts` (registriert eine WEITERE Axora-App im selben Tenant, siehe
 * ADR-14). Beide Skripte brauchen exakt dieselben Graph-Aufrufe (App-Registrierung, Service
 * Principal, "Expose an API", optional App-Only-Graph-Zugriff + Client-Secret) - nur Anzeigename,
 * Redirect-URIs und App Roles unterscheiden sich, daher hier extrahiert statt zweimal dupliziert.
 */
import { randomUUID } from 'node:crypto';
import { Client } from '@microsoft/microsoft-graph-client';

const MICROSOFT_GRAPH_APP_ID = '00000003-0000-0000-c000-000000000000';

export interface GraphApplication {
  id: string;
  appId: string;
}

export interface GraphServicePrincipal {
  id: string;
  appRoles: Array<{ id: string; value: string }>;
}

export interface AppRoleDefinition {
  value: string;
  description: string;
}

export async function findExistingApplication(
  client: Client,
  displayName: string,
): Promise<GraphApplication | null> {
  const response = (await client
    .api('/applications')
    .filter(`displayName eq '${displayName}'`)
    .select('id,appId')
    .get()) as { value: GraphApplication[] };
  return response.value[0] ?? null;
}

/** Legt eine SPA-App-Registrierung mit den übergebenen App Roles an (kein Confidential Client/Secret hier). */
export async function createSpaApplication(
  client: Client,
  displayName: string,
  redirectUris: string[],
  appRoles: AppRoleDefinition[],
): Promise<GraphApplication> {
  return (await client.api('/applications').post({
    displayName,
    signInAudience: 'AzureADMyOrg',
    spa: { redirectUris },
    appRoles: appRoles.map((role) => ({
      id: randomUUID(),
      allowedMemberTypes: ['User'],
      description: role.description,
      displayName: role.value,
      isEnabled: true,
      value: role.value,
    })),
  })) as GraphApplication;
}

export async function createServicePrincipal(client: Client, appId: string): Promise<{ id: string }> {
  return (await client.api('/servicePrincipals').post({ appId })) as { id: string };
}

/** "Expose an API": Application ID URI + Scope `access_as_user` (siehe ADR-6/ADR-14, `msal-config.ts`). */
export async function exposeApiScope(
  client: Client,
  objectId: string,
  appId: string,
  appDisplayName: string,
): Promise<void> {
  await client.api(`/applications/${objectId}`).patch({
    identifierUris: [`api://${appId}`],
  });
  await client.api(`/applications/${objectId}`).patch({
    api: {
      oauth2PermissionScopes: [
        {
          id: randomUUID(),
          adminConsentDescription: `Allows the app to access the ${appDisplayName} backend API as the signed-in user.`,
          adminConsentDisplayName: `Access ${appDisplayName} as the signed-in user`,
          userConsentDescription: `Allows the app to access the ${appDisplayName} backend API on your behalf.`,
          userConsentDisplayName: `Access ${appDisplayName} as you`,
          isEnabled: true,
          type: 'User',
          value: 'access_as_user',
        },
      ],
    },
  });
}

export async function getMicrosoftGraphServicePrincipal(client: Client): Promise<GraphServicePrincipal> {
  const response = (await client
    .api('/servicePrincipals')
    .filter(`appId eq '${MICROSOFT_GRAPH_APP_ID}'`)
    .select('id,appRoles')
    .get()) as { value: GraphServicePrincipal[] };
  const servicePrincipal = response.value[0];
  if (!servicePrincipal) {
    throw new Error('Could not find the Microsoft Graph service principal in this tenant.');
  }
  return servicePrincipal;
}

export function findRoleId(servicePrincipal: GraphServicePrincipal, roleValue: string): string {
  const role = servicePrincipal.appRoles.find((candidate) => candidate.value === roleValue);
  if (!role) {
    throw new Error(`Microsoft Graph does not expose an app role named "${roleValue}".`);
  }
  return role.id;
}

/**
 * Application permissions hinzufügen und direkt per App-Role-Assignment "Admin-Consent" erteilen
 * (siehe ADR-6) - das ist exakt das, was der "Grant admin consent"-Button im Portal im Hintergrund
 * tut. Nur nötig für Apps, die selbst Graph-Aufrufe aus dem Backend machen (z. B. eigene
 * Rollenverwaltung wie `ai-app-hub`) - die meisten weiteren Axora-Apps brauchen das NICHT (YAGNI),
 * siehe `provision-app-registration.ts`.
 */
export async function grantMicrosoftGraphApplicationPermissions(
  client: Client,
  application: GraphApplication,
  clientServicePrincipalId: string,
  requiredRoleValues: string[],
): Promise<void> {
  const graphServicePrincipal = await getMicrosoftGraphServicePrincipal(client);
  const roleIds = requiredRoleValues.map((value) => findRoleId(graphServicePrincipal, value));

  await client.api(`/applications/${application.id}`).patch({
    requiredResourceAccess: [
      {
        resourceAppId: MICROSOFT_GRAPH_APP_ID,
        resourceAccess: roleIds.map((id) => ({ id, type: 'Role' })),
      },
    ],
  });

  for (const appRoleId of roleIds) {
    await client.api(`/servicePrincipals/${clientServicePrincipalId}/appRoleAssignments`).post({
      principalId: clientServicePrincipalId,
      resourceId: graphServicePrincipal.id,
      appRoleId,
    });
  }
}

export async function createClientSecret(
  client: Client,
  objectId: string,
  lifetimeMonths: number,
  secretDisplayName: string,
): Promise<string> {
  const endDateTime = new Date();
  endDateTime.setMonth(endDateTime.getMonth() + lifetimeMonths);

  const response = (await client.api(`/applications/${objectId}/addPassword`).post({
    passwordCredential: {
      displayName: secretDisplayName,
      endDateTime: endDateTime.toISOString(),
    },
  })) as { secretText: string };
  return response.secretText;
}

/** App Roles werden erst nach dem Anlegen der App am Service Principal sichtbar - daher neu laden. */
export async function fetchServicePrincipalWithRoles(
  client: Client,
  appId: string,
): Promise<GraphServicePrincipal> {
  const response = (await client
    .api('/servicePrincipals')
    .filter(`appId eq '${appId}'`)
    .select('id,appRoles')
    .get()) as { value: GraphServicePrincipal[] };
  const [servicePrincipal] = response.value;
  if (!servicePrincipal) {
    throw new Error('Could not fetch the service principal for the newly created application.');
  }
  return servicePrincipal;
}

export async function assignAppRoleToUser(
  client: Client,
  servicePrincipal: GraphServicePrincipal,
  roleValue: string,
  userUpn: string,
): Promise<void> {
  const roleId = findRoleId(servicePrincipal, roleValue);
  const user = (await client.api(`/users/${encodeURIComponent(userUpn)}`).select('id').get()) as {
    id: string;
  };
  await client
    .api(`/servicePrincipals/${servicePrincipal.id}/appRoleAssignedTo`)
    .post({ principalId: user.id, resourceId: servicePrincipal.id, appRoleId: roleId });
}
