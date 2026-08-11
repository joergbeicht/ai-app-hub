/**
 * Setzt/aktualisiert das `employeeId`-Attribut eines bestehenden Benutzers auf den Wert seines
 * Ausweis-Barcodes (siehe ADR-7, "Weg A" - Barcode-Scan-Login für geteilte Tablets). Reines
 * Admin-Hilfsskript für die Einzel-Pflege/manuelle Tests, **kein** Massen-Onboarding-Tool - der
 * eigentliche Prozess zur einmaligen Befüllung von `employeeId` je Mitarbeiter ist in
 * `docs/ARCHITEKTUR-ENTSCHEIDUNGEN.md` (ADR-7) als offener Punkt dokumentiert.
 *
 * Nutzung:
 *   npm run set-employee-badge -- --tenant <tenant-id-oder-domain> --upn <user@domain> \
 *     --badge-code <barcode-wert>
 *
 * Fragt interaktiv per Device-Code-Flow nach Anmeldung - die anmeldende Person braucht im
 * Ziel-Tenant mindestens die Rolle "User Administrator".
 */
import { parseArgs, requireArg } from './lib/cli-args';
import { createDeviceCodeGraphClient } from './lib/device-code-graph-client';

async function setEmployeeBadgeId(tenant: string, upn: string, badgeCode: string): Promise<void> {
  const client = createDeviceCodeGraphClient(tenant, [
    'https://graph.microsoft.com/User.ReadWrite.All',
  ]);
  await client.api(`/users/${upn}`).patch({ employeeId: badgeCode });
  console.log(`\nSet employeeId="${badgeCode}" for ${upn}.`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  await setEmployeeBadgeId(
    requireArg(args, 'tenant'),
    requireArg(args, 'upn'),
    requireArg(args, 'badge-code'),
  );
}

main().catch((error: unknown) => {
  console.error('\nSetting employeeId failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
