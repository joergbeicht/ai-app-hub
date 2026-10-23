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
 * Für eine WEITERE App im selben Tenant (z. B. eine zweite Axora-App neben `ai-app-hub`, siehe
 * ADR-14) siehe `provision-app-registration.ts` - dieses Skript hier ist speziell für `ai-app-hub`
 * selbst (eigene Rollenverwaltung + Graph-Zugriff aus dem Backend).
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
import { ASSIGNABLE_APP_ROLE_VALUES } from '../src/users/app-role.constants';
import { parseArgs, requireArg } from './lib/cli-args';
import { createDeviceCodeGraphClient } from './lib/device-code-graph-client';
import {
  assignAppRoleToUser,
  createClientSecret,
  createServicePrincipal,
  createSpaApplication,
  exposeApiScope,
  fetchServicePrincipalWithRoles,
  findExistingApplication,
  grantMicrosoftGraphApplicationPermissions,
  type GraphServicePrincipal,
} from './lib/app-registration-graph';

const DEFAULT_APP_DISPLAY_NAME = 'Axora AI App Hub';
const DEFAULT_SECRET_LIFETIME_MONTHS = 24;
const REQUIRED_GRAPH_ROLE_VALUES = ['User.Read.All', 'Application.Read.All', 'AppRoleAssignment.ReadWrite.All'];
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

async function provision(options: ProvisionOptions): Promise<void> {
  const client = createDeviceCodeGraphClient(options.tenant, [
    'https://graph.microsoft.com/Application.ReadWrite.All',
    'https://graph.microsoft.com/AppRoleAssignment.ReadWrite.All',
    'https://graph.microsoft.com/Directory.Read.All',
  ]);

  const existing = await findExistingApplication(client, options.displayName);
  if (existing) {
    throw new Error(
      `An application named "${options.displayName}" already exists (appId ${existing.appId}) in this ` +
        'tenant. Delete it first or pass a different --display-name if this is intentional.',
    );
  }

  console.log(`Creating app registration "${options.displayName}"...`);
  const appRoles = ASSIGNABLE_APP_ROLE_VALUES.map((value) => ({
    value,
    description: APP_ROLE_DESCRIPTIONS[value] ?? value,
  }));
  const application = await createSpaApplication(client, options.displayName, [options.frontendUrl], appRoles);

  console.log('Creating service principal (Enterprise Application)...');
  const servicePrincipal = await createServicePrincipal(client, application.appId);

  console.log('Exposing API scope "access_as_user"...');
  await exposeApiScope(client, application.id, application.appId, options.displayName);

  console.log('Adding Microsoft Graph application permissions + admin consent...');
  await grantMicrosoftGraphApplicationPermissions(
    client,
    application,
    servicePrincipal.id,
    REQUIRED_GRAPH_ROLE_VALUES,
  );

  console.log(`Creating client secret (valid for ${options.secretLifetimeMonths} months)...`);
  const clientSecret = await createClientSecret(
    client,
    application.id,
    options.secretLifetimeMonths,
    'provision-customer-tenant script',
  );

  if (options.firstAdminUpn) {
    console.log(`Assigning "Administrator" role to ${options.firstAdminUpn}...`);
    const servicePrincipalWithRoles: GraphServicePrincipal = await fetchServicePrincipalWithRoles(
      client,
      application.appId,
    );
    await assignAppRoleToUser(client, servicePrincipalWithRoles, 'Administrator', options.firstAdminUpn);
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
  const client = createDeviceCodeGraphClient(options.tenant, [
    'https://graph.microsoft.com/AppRoleAssignment.ReadWrite.All',
    'https://graph.microsoft.com/Directory.Read.All',
  ]);
  const servicePrincipal = await fetchServicePrincipalWithRoles(client, options.clientId);
  await assignAppRoleToUser(client, servicePrincipal, 'Administrator', options.user);
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
