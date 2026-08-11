/**
 * Löscht einen per `create-test-user.ts` angelegten Testbenutzer wieder - Gegenstück für die
 * Aufräum-Seite manueller Tests (siehe ADR-7, z. B. Passkey-Registrierung).
 *
 * Nutzung:
 *   npm run delete-test-user -- --tenant <tenant-id-oder-domain> --upn <user@domain>
 *
 * Fragt interaktiv per Device-Code-Flow nach Anmeldung - die anmeldende Person braucht im
 * Ziel-Tenant mindestens die Rolle "User Administrator".
 */
import { parseArgs, requireArg } from './lib/cli-args';
import { createDeviceCodeGraphClient } from './lib/device-code-graph-client';

async function deleteTestUser(tenant: string, upn: string): Promise<void> {
  const client = createDeviceCodeGraphClient(tenant, [
    'https://graph.microsoft.com/User.ReadWrite.All',
  ]);
  await client.api(`/users/${upn}`).delete();
  console.log(`\nDeleted user ${upn}.`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  await deleteTestUser(requireArg(args, 'tenant'), requireArg(args, 'upn'));
}

main().catch((error: unknown) => {
  console.error('\nDeleting the test user failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
