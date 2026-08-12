/**
 * Richtet einen Tablet-Benutzer für den PIN+ROPC-Login ein (siehe ADR-12 in
 * `docs/ARCHITEKTUR-ENTSCHEIDUNGEN.md`): setzt ein neues, festes Entra-Passwort für den
 * Benutzer, fügt ihn zur Sicherheitsgruppe `TABLET_USERS_GROUP_ID` hinzu und legt das zugehörige
 * Key-Vault-Secret (`tablet-cred-<badgeCode>`, echtes Passwort + PIN-Hash) an. Reines
 * Admin-Hilfsskript für Einzel-Provisionierung/Tests - **kein** Massen-Onboarding-Tool.
 *
 * Nutzung:
 *   npm run provision-tablet-credential -- --tenant <tenant-id-oder-domain> \
 *     --key-vault-url https://<vault>.vault.azure.net --upn tablet-user@contoso.com \
 *     --badge-code TABLET-001 --group-id <object-id-von-AI-App-Hub-Tablet-Users> \
 *     [--pin 1234]
 *
 * Fragt interaktiv per Device-Code-Flow nach Anmeldung - die anmeldende Person braucht im
 * Ziel-Tenant "User Administrator" (Passwort setzen/Gruppenmitgliedschaft) UND die RBAC-Rolle
 * "Key Vault Secrets Officer" auf dem angegebenen Vault.
 */
import { randomBytes, randomInt } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { SecretClient } from '@azure/keyvault-secrets';
import { parseArgs, requireArg } from './lib/cli-args';
import {
  createDeviceCodeCredential,
  createDeviceCodeGraphClient,
} from './lib/device-code-graph-client';
import type { TabletCredential } from '../src/tablet-auth/tablet-credential.model';

interface ProvisionOptions {
  tenant: string;
  keyVaultUrl: string;
  userPrincipalName: string;
  badgeCode: string;
  groupId?: string;
  pin?: string;
}

const BCRYPT_ROUNDS = 10;

function generateEntraPassword(): string {
  // Wie `create-test-user.ts`: zufällige Basis + fester Suffix, damit Entras
  // Komplexitätsregeln unabhängig vom Zufallsanteil sicher erfüllt werden.
  const randomPart = randomBytes(18).toString('base64').replace(/[/+=]/g, '');
  return `${randomPart.slice(0, 16)}Ax1!`;
}

function generatePin(): string {
  return String(randomInt(0, 10_000)).padStart(4, '0');
}

async function provisionTabletCredential(options: ProvisionOptions): Promise<void> {
  const pin = options.pin ?? generatePin();
  if (!/^\d{4}$/.test(pin)) {
    throw new Error('--pin must be exactly 4 digits');
  }

  const graphClient = createDeviceCodeGraphClient(options.tenant, [
    'https://graph.microsoft.com/User.ReadWrite.All',
    'https://graph.microsoft.com/GroupMember.ReadWrite.All',
  ]);

  const entraPassword = generateEntraPassword();
  const user = (await graphClient
    .api(`/users/${options.userPrincipalName}`)
    .select('id')
    .get()) as {
    id: string;
  };

  await graphClient.api(`/users/${user.id}`).patch({
    passwordProfile: { password: entraPassword, forceChangePasswordNextSignIn: false },
  });
  console.log(`\nSet a new, fixed Entra password for ${options.userPrincipalName}.`);

  if (options.groupId) {
    await graphClient.api(`/groups/${options.groupId}/members/$ref`).post({
      '@odata.id': `https://graph.microsoft.com/v1.0/directoryObjects/${user.id}`,
    });
    console.log(`Added ${options.userPrincipalName} to group ${options.groupId}.`);
  }

  const credential: TabletCredential = {
    userPrincipalName: options.userPrincipalName,
    entraPassword,
    pinHash: await bcrypt.hash(pin, BCRYPT_ROUNDS),
    failedAttempts: 0,
    lockedUntil: null,
  };

  const secretClient = new SecretClient(
    options.keyVaultUrl,
    createDeviceCodeCredential(options.tenant),
  );
  await secretClient.setSecret(`tablet-cred-${options.badgeCode}`, JSON.stringify(credential));

  console.log(`\nStored Key Vault secret "tablet-cred-${options.badgeCode}".`);
  console.log(
    '\nHand the PIN to the employee (not the password - the backend never exposes it):\n',
  );
  console.log(
    JSON.stringify(
      { badgeCode: options.badgeCode, userPrincipalName: options.userPrincipalName, pin },
      null,
      2,
    ),
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  await provisionTabletCredential({
    tenant: requireArg(args, 'tenant'),
    keyVaultUrl: requireArg(args, 'key-vault-url'),
    userPrincipalName: requireArg(args, 'upn'),
    badgeCode: requireArg(args, 'badge-code'),
    groupId: args.get('group-id'),
    pin: args.get('pin'),
  });
}

main().catch((error: unknown) => {
  console.error(
    '\nProvisioning the tablet credential failed:',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
