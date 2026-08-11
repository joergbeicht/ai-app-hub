/**
 * Automatisiert die einmalige Azure-AD-Einrichtung für einen neuen Kunden-Tenant (siehe
 * docs/ARCHITEKTUR-ENTSCHEIDUNGEN.md, ADR-7/ADR-8): App-Registrierung (SPA + Confidential Client),
 * App Roles, "Expose an API"-Scope, Microsoft-Graph-Berechtigungen samt Admin-Consent,
 * Client-Secret und optional die erste Administrator-Zuweisung (Bootstrap-Admin-Problem).
 *
 * Voraussetzung: Der Ziel-Tenant (Entra External ID / Entra ID) existiert bereits - dieses Skript
 * erstellt KEINEN neuen Tenant und KEIN Kubernetes-Cluster, nur die App-Registrierung darin. Die
 * ausführende Person muss im Ziel-Tenant mindestens "Cloud Application Administrator" +
 * "Privileged Role Administrator" (für Admin-Consent) sein - typischerweise der Global
 * Administrator, der den Tenant gerade angelegt hat.
 *
 * Nutzung:
 *   npm run provision:tenant -- --tenant <tenant-id-oder-domain> --frontend-url https://kunde.axora.app [--first-admin-upn admin@kunde.com]
 *   npm run provision:assign-admin -- --tenant <tenant-id> --client-id <app-id> --user someone@kunde.com
 *
 * Beide Kommandos fragen interaktiv per Device-Code-Flow nach Anmeldung (Browser öffnet sich
 * nicht automatisch - die ausgegebene URL + Code manuell eingeben). Es wird bewusst KEINE eigene
 * Bootstrap-App-Registrierung dafür angelegt, sondern Microsofts eigener, multi-tenant-fähiger
 * "Microsoft Graph Command Line Tools"-Client verwendet (dieselbe App, die z. B. das Microsoft
 * Graph PowerShell SDK nutzt) - das erspart ein Henne-Ei-Problem beim allerersten Setup.
 */
import { randomUUID } from 'node:crypto';
import { Client } from '@microsoft/microsoft-graph-client';
import { ASSIGNABLE_APP_ROLE_VALUES } from '../src/users/app-role.constants';
import { parseArgs, requireArg } from './lib/cli-args';
import { createDeviceCodeGraphClient } from './lib/device-code-graph-client';

const MICROSOFT_GRAPH_APP_ID = '00000003-0000-0000-c000-000000000000';
const DEFAULT_APP_DISPLAY_NAME = 'Axora AI App Hub';
const DEFAULT_SECRET_LIFETIME_MONTHS = 24;
/** Muss zu den Rollen-Beschreibungen in `access_as_user` / ADR-6 passen. */
const APP_ROLE_DESCRIPTIONS: Record<string, string> = {
  User: 'Can use the AI App Hub with standard access.',
  Administrator: "Can manage other users' roles in the AI App Hub (see ADR-6).",
};

interface ProvisionOptions {
  tenant: string;
  frontendUrl: string;
  displayName: string;
  secretLifetimeMonths: number;
  firstAdminUpn?: string;
}

interface AssignAdminOptions {
  tenant: string;
  clientId: string;
  user: string;
}

interface GraphApplication {
  id: string;
  appId: string;
}

interface GraphServicePrincipal {
  id: string;
  appRoles: Array<{ id: string; value: string }>;
}

function createGraphClient(tenantId: string): Client {
  return createDeviceCodeGraphClient(tenantId, [
    'https://graph.microsoft.com/Application.ReadWrite.All',
    'https://graph.microsoft.com/AppRoleAssignment.ReadWrite.All',
    'https://graph.microsoft.com/Directory.Read.All',
  ]);
}

async function findExistingApplication(
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

async function createApplication(
  client: Client,
  displayName: string,
  frontendUrl: string,
): Promise<GraphApplication> {
  const appRoles = ASSIGNABLE_APP_ROLE_VALUES.map((value) => ({
    id: randomUUID(),
    allowedMemberTypes: ['User'],
    description: APP_ROLE_DESCRIPTIONS[value] ?? value,
    displayName: value,
    isEnabled: true,
    value,
  }));

  return (await client.api('/applications').post({
    displayName,
    signInAudience: 'AzureADMyOrg',
    spa: { redirectUris: [frontendUrl] },
    appRoles,
  })) as GraphApplication;
}

async function createServicePrincipal(client: Client, appId: string): Promise<{ id: string }> {
  return (await client.api('/servicePrincipals').post({ appId })) as { id: string };
}

/** "Expose an API": Application ID URI + Scope `access_as_user` (siehe ADR-6, `msal-config.ts`). */
async function exposeApiScope(client: Client, objectId: string, appId: string): Promise<void> {
  await client.api(`/applications/${objectId}`).patch({
    identifierUris: [`api://${appId}`],
  });
  await client.api(`/applications/${objectId}`).patch({
    api: {
      oauth2PermissionScopes: [
        {
          id: randomUUID(),
          adminConsentDescription:
            'Allows the app to access the AI App Hub backend API as the signed-in user.',
          adminConsentDisplayName: 'Access ai-app-hub as the signed-in user',
          userConsentDescription:
            'Allows the app to access the AI App Hub backend API on your behalf.',
          userConsentDisplayName: 'Access ai-app-hub as you',
          isEnabled: true,
          type: 'User',
          value: 'access_as_user',
        },
      ],
    },
  });
}

async function getMicrosoftGraphServicePrincipal(client: Client): Promise<GraphServicePrincipal> {
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

function findRoleId(servicePrincipal: GraphServicePrincipal, roleValue: string): string {
  const role = servicePrincipal.appRoles.find((candidate) => candidate.value === roleValue);
  if (!role) {
    throw new Error(`Microsoft Graph does not expose an app role named "${roleValue}".`);
  }
  return role.id;
}

/**
 * Application permissions (`User.Read.All`, `Application.Read.All`, `AppRoleAssignment.ReadWrite.All`)
 * hinzufügen und direkt per App-Role-Assignment "Admin-Consent" erteilen (siehe ADR-6) - das ist
 * exakt das, was der "Grant admin consent"-Button im Portal im Hintergrund tut.
 */
async function grantMicrosoftGraphApplicationPermissions(
  client: Client,
  application: GraphApplication,
  clientServicePrincipalId: string,
): Promise<void> {
  const graphServicePrincipal = await getMicrosoftGraphServicePrincipal(client);
  const requiredRoleValues = ['User.Read.All', 'Application.Read.All', 'AppRoleAssignment.ReadWrite.All'];
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

async function createClientSecret(
  client: Client,
  objectId: string,
  lifetimeMonths: number,
): Promise<string> {
  const endDateTime = new Date();
  endDateTime.setMonth(endDateTime.getMonth() + lifetimeMonths);

  const response = (await client.api(`/applications/${objectId}/addPassword`).post({
    passwordCredential: {
      displayName: 'provision-customer-tenant script',
      endDateTime: endDateTime.toISOString(),
    },
  })) as { secretText: string };
  return response.secretText;
}

async function assignAdministratorRole(
  client: Client,
  clientServicePrincipal: GraphServicePrincipal,
  userUpn: string,
): Promise<void> {
  const administratorRoleId = findRoleId(clientServicePrincipal, 'Administrator');
  const user = (await client.api(`/users/${encodeURIComponent(userUpn)}`).select('id').get()) as {
    id: string;
  };
  await client
    .api(`/servicePrincipals/${clientServicePrincipal.id}/appRoleAssignedTo`)
    .post({ principalId: user.id, resourceId: clientServicePrincipal.id, appRoleId: administratorRoleId });
}

async function provision(options: ProvisionOptions): Promise<void> {
  const client = createGraphClient(options.tenant);

  const existing = await findExistingApplication(client, options.displayName);
  if (existing) {
    throw new Error(
      `An application named "${options.displayName}" already exists (appId ${existing.appId}) in this ` +
        'tenant. Delete it first or pass a different --display-name if this is intentional.',
    );
  }

  console.log(`Creating app registration "${options.displayName}"...`);
  const application = await createApplication(client, options.displayName, options.frontendUrl);

  console.log('Creating service principal (Enterprise Application)...');
  const servicePrincipal = await createServicePrincipal(client, application.appId);

  console.log('Exposing API scope "access_as_user"...');
  await exposeApiScope(client, application.id, application.appId);

  console.log('Adding Microsoft Graph application permissions + admin consent...');
  await grantMicrosoftGraphApplicationPermissions(client, application, servicePrincipal.id);

  console.log(`Creating client secret (valid for ${options.secretLifetimeMonths} months)...`);
  const clientSecret = await createClientSecret(
    client,
    application.id,
    options.secretLifetimeMonths,
  );

  if (options.firstAdminUpn) {
    console.log(`Assigning "Administrator" role to ${options.firstAdminUpn}...`);
    // appRoles werden erst nach dem Anlegen der App an der Service Principal sichtbar - neu laden.
    const appServicePrincipal = (await client
      .api('/servicePrincipals')
      .filter(`appId eq '${application.appId}'`)
      .select('id,appRoles')
      .get()) as { value: GraphServicePrincipal[] };
    const [servicePrincipalWithRoles] = appServicePrincipal.value;
    if (!servicePrincipalWithRoles) {
      throw new Error('Could not re-fetch the newly created service principal.');
    }
    await assignAdministratorRole(client, servicePrincipalWithRoles, options.firstAdminUpn);
  }

  console.log('\nDone. Store these values as the new customer\'s backend secrets - the client');
  console.log('secret is shown only once and cannot be retrieved again:\n');
  console.log(
    JSON.stringify(
      {
        AZURE_TENANT_ID: options.tenant,
        AZURE_CLIENT_ID: application.appId,
        AZURE_CLIENT_SECRET: clientSecret,
        BACKEND_API_SCOPE: `api://${application.appId}/access_as_user`,
      },
      null,
      2,
    ),
  );
}

async function assignAdmin(options: AssignAdminOptions): Promise<void> {
  const client = createGraphClient(options.tenant);
  const response = (await client
    .api('/servicePrincipals')
    .filter(`appId eq '${options.clientId}'`)
    .select('id,appRoles')
    .get()) as { value: GraphServicePrincipal[] };
  const servicePrincipal = response.value[0];
  if (!servicePrincipal) {
    throw new Error(`No service principal found for appId ${options.clientId} in this tenant.`);
  }
  await assignAdministratorRole(client, servicePrincipal, options.user);
  console.log(`Assigned "Administrator" to ${options.user}.`);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (command === 'provision') {
    await provision({
      tenant: requireArg(args, 'tenant'),
      frontendUrl: requireArg(args, 'frontend-url'),
      displayName: args.get('display-name') ?? DEFAULT_APP_DISPLAY_NAME,
      secretLifetimeMonths: Number(args.get('secret-lifetime-months') ?? DEFAULT_SECRET_LIFETIME_MONTHS),
      firstAdminUpn: args.get('first-admin-upn'),
    });
    return;
  }

  if (command === 'assign-admin') {
    await assignAdmin({
      tenant: requireArg(args, 'tenant'),
      clientId: requireArg(args, 'client-id'),
      user: requireArg(args, 'user'),
    });
    return;
  }

  throw new Error(`Unknown command "${command}". Use "provision" or "assign-admin".`);
}

main().catch((error: unknown) => {
  console.error('\nProvisioning failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
