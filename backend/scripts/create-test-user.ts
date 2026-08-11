/**
 * Legt einen einzelnen Testbenutzer in einem bestehenden Tenant an - reines Hilfsskript für
 * manuelle Tests (z. B. Passkey-Registrierung, siehe ARCHITEKTUR-ENTSCHEIDUNGEN.md ADR-7),
 * **kein** Teil der Kunden-Onboarding-Automatisierung (dafür gibt es die
 * Self-Service-Sign-up-User-Flows aus ADR-7 - Mitarbeiter legen sich dort selbst an).
 *
 * Nutzung:
 *   npm run create-test-user -- --tenant <tenant-id-oder-domain> --upn-prefix passkey-test \
 *     [--display-name "Passkey Testuser"] [--domain <verified-domain>]
 *
 * Fragt interaktiv per Device-Code-Flow nach Anmeldung - die anmeldende Person braucht im
 * Ziel-Tenant mindestens die Rolle "User Administrator". Das initiale Kennwort wird zufällig
 * erzeugt, einmalig auf der Konsole ausgegeben (Microsoft Graph gibt es danach nicht mehr heraus)
 * und muss vom Testbenutzer beim ersten Login sofort geändert werden.
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
    passwordProfile: {
      password: temporaryPassword,
      forceChangePasswordNextSignIn: true,
    },
  })) as CreatedUser;

  console.log(`\nCreated test user ${user.userPrincipalName} (id ${user.id}).`);
  console.log('Store this temporary password securely - Microsoft Graph will not show it again:\n');
  console.log(
    JSON.stringify(
      {
        userPrincipalName: user.userPrincipalName,
        temporaryPassword,
        signInUrl: 'https://mysignins.microsoft.com/security-info',
      },
      null,
      2,
    ),
  );
  console.log(
    '\nNext step: sign in once with the temporary password to set a real one, then use ' +
      '"Add sign-in method" -> "Passkey" on the security-info page above.',
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  await createTestUser({
    tenant: requireArg(args, 'tenant'),
    displayName: args.get('display-name') ?? 'AI App Hub Test User',
    upnPrefix: requireArg(args, 'upn-prefix'),
    domain: args.get('domain'),
  });
}

main().catch((error: unknown) => {
  console.error('\nCreating the test user failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
