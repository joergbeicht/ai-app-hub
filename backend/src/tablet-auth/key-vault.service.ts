import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientSecretCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import { TabletCredential } from './tablet-credential.model';

/**
 * Speichert/liest die pro Tablet-Benutzer nötigen Geheimnisse (echtes Entra-Passwort + PIN-Hash +
 * Lockout-Zustand, siehe `TabletCredential`) in Azure Key Vault (siehe ADR-12). Nutzt dieselbe
 * App-Registrierung wie `GraphService` (Client-Credentials-Flow) - dafür muss der Vault der
 * Service Principal eine "Get"/"Set"-Zugriffsrichtlinie (oder RBAC-Rolle "Key Vault Secrets
 * Officer") für Secrets einräumen.
 *
 * Bewusst lazy/optional konfiguriert (`ConfigService.get`, nicht `getOrThrow`): Ein Cluster, für
 * das noch kein Key Vault provisioniert wurde, soll nicht den kompletten Backend-Container zum
 * Absturz bringen (im Unterschied zu `AZURE_CLIENT_SECRET`, das für die Kernfunktion
 * Rollenverwaltung zwingend ist) - nur der Tablet-Login-Endpunkt lehnt Anfragen dann mit einer
 * klaren 503 ab (siehe `TabletAuthService`).
 */
@Injectable()
export class KeyVaultService {
  private readonly logger = new Logger(KeyVaultService.name);
  private client: SecretClient | null | undefined;

  constructor(private readonly configService: ConfigService) {}

  async getCredential(badgeCode: string): Promise<TabletCredential | null> {
    const client = this.getClient();
    try {
      const secret = await client.getSecret(this.secretName(badgeCode));
      return secret.value ? (JSON.parse(secret.value) as TabletCredential) : null;
    } catch (error) {
      if (this.isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async saveCredential(badgeCode: string, credential: TabletCredential): Promise<void> {
    const client = this.getClient();
    await client.setSecret(this.secretName(badgeCode), JSON.stringify(credential));
  }

  /** Key-Vault-Secret-Namen erlauben dieselbe Zeichenmenge wie `BADGE_CODE_PATTERN` (A-Z, 0-9, `-`). */
  private secretName(badgeCode: string): string {
    return `tablet-cred-${badgeCode}`;
  }

  private isNotFound(error: unknown): boolean {
    return (error as { statusCode?: number } | undefined)?.statusCode === 404;
  }

  /** Baut den `SecretClient` erst beim ersten Zugriff auf - siehe Klassenkommentar zu "lazy". */
  private getClient(): SecretClient {
    if (this.client === undefined) {
      this.client = this.buildClient();
    }
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Tablet login is not configured for this cluster (AZURE_KEY_VAULT_URL missing)',
      );
    }
    return this.client;
  }

  private buildClient(): SecretClient | null {
    const vaultUrl = this.configService.get<string>('AZURE_KEY_VAULT_URL');
    if (!vaultUrl) {
      this.logger.warn('AZURE_KEY_VAULT_URL is not set - tablet login stays disabled.');
      return null;
    }
    const tenantId = this.configService.getOrThrow<string>('AZURE_TENANT_ID');
    const clientId = this.configService.getOrThrow<string>('AZURE_CLIENT_ID');
    const clientSecret = this.configService.getOrThrow<string>('AZURE_CLIENT_SECRET');
    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    return new SecretClient(vaultUrl, credential);
  }
}
