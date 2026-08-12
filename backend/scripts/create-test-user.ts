/**
 * Legt einen einzelnen Testbenutzer in einem bestehenden Tenant an - reines Hilfsskript für
 * manuelle Tests (z. B. Passkey-Registrierung oder Ausweis-Barcode-Login, siehe
 * ARCHITEKTUR-ENTSCHEIDUNGEN.md ADR-7), **kein** Teil der Kunden-Onboarding-Automatisierung
 * (dafür gibt es die Self-Service-Sign-up-User-Flows aus ADR-7 - Mitarbeiter legen sich dort
 * selbst an).
 *
 * Nutzung:
 *   npm run create-test-user -- --tenant <tenant-id-oder-domain> --upn-prefix passkey-test \
 *     [--display-name "Passkey Testuser"] [--domain <verified-domain>] \
 *     [--employee-id <badge-code>] [--fixed-password]
 *
 * Fragt interaktiv per Device-Code-Flow nach Anmeldung - die anmeldende Person braucht im
 * Ziel-Tenant mindestens die Rolle "User Administrator".
 *
 * --fixed-password: Ohne diese Option muss der Testbenutzer das zufällig erzeugte Passwort beim
 * ersten Login sofort ändern (Standard-Entra-Verhalten). Für den Ausweis-Barcode-Login (ADR-7,
 * "Weg A": festes, Entra-konformes Passwort statt einmaligem Temp-Passwort) diese Option setzen -
 * das Passwort bleibt dann dauerhaft gültig, genau wie bei einem echten Werkstatt-Mitarbeiter.
 *
 * --employee-id: Setzt das `employeeId`-Attribut direkt bei der Erstellung (Barcode-Wert für den
 * Ausweis-Scan-Login, siehe backend/src/badge-login/) statt per separatem
 * set-employee-badge-id.ts-Aufruf.
 */
import { randomBytes } from 'node:crypto';
import { Client } from '@microsoft/microsoft-graph-client';
import { parseArgs, requireArg } from './lib/cli-args';
import { createDeviceCodeGraphClient } from './lib/device-code-graph-client';

interface CreateTestUserOptions {
  tenant: string;
  displayName: string;
  upnPrefix: string;
  domain?: string;
  employeeId?: string;
  fixedPassword: boolean;
}

interface VerifiedDomain {
  name: string;
  isDefault: boolean;
}

interface CreatedUser {
  id: string;
  userPrincipalName: string;
}

function generateTemporaryPassword(): string {
  // Zufällige Basis + fester Suffix mit Groß-/Kleinbuchstabe, Ziffer und Sonderzeichen, damit
  // Entras Passwort-Komplexitätsregeln unabhängig vom Zufallsanteil sicher erfüllt werden.
  const randomPart = randomBytes(18).toString('base64').replace(/[/+=]/g, '');
  return `${randomPart.slice(0, 16)}Ax1!`;
}

async function resolveDefaultVerifiedDomain(client: Client): Promise<string> {
  const response = (await client.api('/organization').select('verifiedDomains').get()) as {
    value: Array<{ verifiedDomains: VerifiedDomain[] }>;
  };
  const domains = response.value[0]?.verifiedDomains ?? [];
  const defaultDomain = domains.find((domain) => domain.isDefault) ?? domains[0];
  if (!defaultDomain) {
    throw new Error(
      'Could not determine a verified domain for this tenant - pass --domain explicitly.',
    );
  }
  return defaultDomain.name;
}

async function createTestUser(options: CreateTestUserOptions): Promise<void> {
  const client = createDeviceCodeGraphClient(options.tenant, [
    'https://graph.microsoft.com/User.ReadWrite.All',
  ]);
  const domain = options.domain ?? (await resolveDefaultVerifiedDomain(client));
  const userPrincipalName = `${options.upnPrefix}@${domain}`;
  const temporaryPassword = generateTemporaryPassword();

  const user = (await client.api('/users').post({
    accountEnabled: true,
    displayName: options.displayName,
    mailNickname: options.upnPrefix,
    userPrincipalName,
    ...(options.employeeId ? { employeeId: options.employeeId } : {}),
    passwordProfile: {
      password: temporaryPassword,
      forceChangePasswordNextSignIn: !options.fixedPassword,
    },
  })) as CreatedUser;

  console.log(`\nCreated test user ${user.userPrincipalName} (id ${user.id}).`);
  console.log(
    options.fixedPassword
      ? 'Store this password securely - Microsoft Graph will not show it again. It stays valid ' +
          '(no forced change on first sign-in, see ADR-7 "Weg A"):\n'
      : 'Store this temporary password securely - Microsoft Graph will not show it again:\n',
  );
  console.log(
    JSON.stringify(
      {
        userPrincipalName: user.userPrincipalName,
        ...(options.fixedPassword ? { password: temporaryPassword } : { temporaryPassword }),
        ...(options.employeeId ? { employeeId: options.employeeId } : {}),
        signInUrl: 'https://mysignins.microsoft.com/security-info',
      },
      null,
      2,
    ),
  );
  if (!options.fixedPassword) {
    console.log(
      '\nNext step: sign in once with the temporary password to set a real one, then use ' +
        '"Add sign-in method" -> "Passkey" on the security-info page above.',
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  await createTestUser({
    tenant: requireArg(args, 'tenant'),
    displayName: args.get('display-name') ?? 'AI App Hub Test User',
    upnPrefix: requireArg(args, 'upn-prefix'),
    domain: args.get('domain'),
    employeeId: args.get('employee-id'),
    fixedPassword: args.has('fixed-password'),
  });
}

main().catch((error: unknown) => {
  console.error('\nCreating the test user failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
