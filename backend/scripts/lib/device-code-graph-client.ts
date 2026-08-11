import { DeviceCodeCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';

/** Well-known, multi-tenant Microsoft-First-Party-App ("Microsoft Graph Command Line Tools"). */
const DEVICE_CODE_CLIENT_ID =
  process.env['PROVISIONING_CLIENT_ID'] ?? '14d82eec-204b-4c2f-b7e8-296a70dab67e';

/**
 * Device-Code-Flow statt Client-Secret: Die einmaligen Setup-/Test-Skripte unter `backend/scripts/`
 * richten Dinge im Ziel-Tenant erst EIN (App-Registrierung, Testbenutzer, ...), es kann also noch
 * kein eigenes App-Secret geben. Die ausführende Person meldet sich interaktiv mit ihrem eigenen,
 * privilegierten Konto im Ziel-Tenant an - dafür ist KEINE eigene Bootstrap-App-Registrierung nötig,
 * da Microsofts eigener, multi-tenant-fähiger Client verwendet wird (kein Henne-Ei-Problem).
 */
export function createDeviceCodeGraphClient(tenantId: string, scopes: string[]): Client {
  const credential = new DeviceCodeCredential({
    tenantId,
    clientId: DEVICE_CODE_CLIENT_ID,
    userPromptCallback: (info) => {
      console.log(`\n${info.message}\n`);
    },
  });
  const authProvider = new TokenCredentialAuthenticationProvider(credential, { scopes });
  return Client.initWithMiddleware({ authProvider });
}
