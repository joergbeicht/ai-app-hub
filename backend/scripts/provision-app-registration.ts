/**
 * Registriert eine WEITERE Axora-App (Baustein oder Fachapplikation) in einem Tenant, in dem bereits
 * mindestens eine App registriert ist (typischerweise `ai-app-hub`, siehe `provision-customer-tenant.ts`).
 * Siehe docs/ARCHITEKTUR-ENTSCHEIDUNGEN.md ADR-14: Silent-SSO zwischen Axora-Apps funktioniert nur,
 * wenn beide Apps im selben Entra-Tenant registriert sind - jede App braucht trotzdem ihre EIGENE
 * App-Registrierung (eigene Client-ID, eigene Redirect-URI, eigener API-Scope), siehe
 * `platform-architecture.mdc` ("volle Architektur pro Baustein/Fachapplikation").
 *
 * Anders als `provision-customer-tenant.ts` (bootstrapt `ai-app-hub` selbst inkl. eigener
 * Rollenverwaltung) fordert dieses Skript standardmäßig KEINE Microsoft-Graph-Berechtigungen an und
 * legt KEIN Client-Secret an: Die meisten weiteren Apps validieren eingehende JWTs nur gegen das
 * öffentliche JWKS-Format der eigenen App-Registrierung und rufen selbst nie Graph auf (YAGNI). Nur
 * wenn die neue App genau wie `ai-app-hub` ihre eigene Nutzerverwaltung per Graph betreiben soll,
 * `--with-graph-access` setzen.
 *
 * Voraussetzung: ausführende Person ist im Ziel-Tenant "Cloud Application Administrator" (+
 * "Privileged Role Administrator", nur bei `--with-graph-access` für den Admin-Consent nötig).
 *
 * Nutzung:
 *   npm run provision:app -- --tenant <tenant-id> --display-name "AI Datenorchestrator" \
 *     --frontend-url https://kunde.axora.app/orchestrator \
 *     [--roles User,Administrator] [--with-graph-access] [--secret-lifetime-months 24]
 */
import { parseArgs, requireArg } from './lib/cli-args';
import { createDeviceCodeGraphClient } from './lib/device-code-graph-client';
import {
  createClientSecret,
  createServicePrincipal,
  createSpaApplication,
  exposeApiScope,
  findExistingApplication,
  grantMicrosoftGraphApplicationPermissions,
} from './lib/app-registration-graph';

const DEFAULT_ROLES = ['User', 'Administrator'];
const DEFAULT_SECRET_LIFETIME_MONTHS = 24;
/** Nur relevant mit `--with-graph-access` - dieselben Rechte wie `ai-app-hub` (siehe ADR-6). */
const GRAPH_ROLE_VALUES_FOR_OWN_USER_MANAGEMENT = [
  'User.Read.All',
  'Application.Read.All',
  'AppRoleAssignment.ReadWrite.All',
];

interface Options {
  tenant: string;
  displayName: string;
  frontendUrl: string;
  roles: string[];
  withGraphAccess: boolean;
  secretLifetimeMonths: number;
}

async function provision(options: Options): Promise<void> {
  const requiredScopes = ['https://graph.microsoft.com/Application.ReadWrite.All'];
  if (options.withGraphAccess) {
    requiredScopes.push('https://graph.microsoft.com/AppRoleAssignment.ReadWrite.All');
  }
  const client = createDeviceCodeGraphClient(options.tenant, requiredScopes);

  const existing = await findExistingApplication(client, options.displayName);
  if (existing) {
    throw new Error(
      `An application named "${options.displayName}" already exists (appId ${existing.appId}) in this ` +
        'tenant. Delete it first or pass a different --display-name if this is intentional.',
    );
  }

  console.log(`Creating app registration "${options.displayName}"...`);
  const appRoles = options.roles.map((value) => ({
    value,
    description: `Can use ${options.displayName} with the "${value}" role.`,
  }));
  const application = await createSpaApplication(
    client,
    options.displayName,
    [options.frontendUrl],
    appRoles,
  );

  console.log('Creating service principal (Enterprise Application)...');
  const servicePrincipal = await createServicePrincipal(client, application.appId);

  console.log('Exposing API scope "access_as_user"...');
  await exposeApiScope(client, application.id, application.appId, options.displayName);

  let clientSecret: string | null = null;
  if (options.withGraphAccess) {
    console.log('Adding Microsoft Graph application permissions + admin consent...');
    await grantMicrosoftGraphApplicationPermissions(
      client,
      application,
      servicePrincipal.id,
      GRAPH_ROLE_VALUES_FOR_OWN_USER_MANAGEMENT,
    );

    console.log(`Creating client secret (valid for ${options.secretLifetimeMonths} months)...`);
    clientSecret = await createClientSecret(
      client,
      application.id,
      options.secretLifetimeMonths,
      `${options.displayName} provisioning`,
    );
  }

  console.log(`\nDone. Store these values as "${options.displayName}"'s frontend/backend config:\n`);
  console.log(
    JSON.stringify(
      {
        AZURE_TENANT_ID: options.tenant,
        AZURE_CLIENT_ID: application.appId,
        BACKEND_API_SCOPE: `api://${application.appId}/access_as_user`,
        ...(clientSecret ? { AZURE_CLIENT_SECRET: clientSecret } : {}),
      },
      null,
      2,
    ),
  );
  console.log(
    '\nDiese App teilt sich den Entra-Tenant mit ai-app-hub - Personen, die dort bereits angemeldet',
  );
  console.log(
    'sind, werden beim Öffnen dieser App per Silent-SSO automatisch erkannt (kein erneutes Passwort,',
  );
  console.log('siehe ADR-14). Redirect-URI + App-Registrierung sind trotzdem pro App eigenständig.');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  await provision({
    tenant: requireArg(args, 'tenant'),
    displayName: requireArg(args, 'display-name'),
    frontendUrl: requireArg(args, 'frontend-url'),
    roles: (args.get('roles') ?? DEFAULT_ROLES.join(',')).split(',').map((role) => role.trim()),
    withGraphAccess: args.get('with-graph-access') === 'true',
    secretLifetimeMonths: Number(args.get('secret-lifetime-months') ?? DEFAULT_SECRET_LIFETIME_MONTHS),
  });
}

main().catch((error: unknown) => {
  console.error('\nProvisioning failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
