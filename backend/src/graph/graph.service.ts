import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';

export interface GraphUser {
  id: string;
  displayName: string;
  mail: string | null;
  userPrincipalName: string;
}

export interface AppRole {
  id: string;
  value: string;
}

export interface AppRoleAssignment {
  id: string;
  principalId: string;
  appRoleId: string;
}

interface ServicePrincipal {
  id: string;
  appRoles: AppRole[];
}

/**
 * Ruft Microsoft Graph im Client-Credentials-Flow auf (App-only, `.default`-Scope) - läuft
 * ausschließlich im Backend, nie im Browser (siehe `AzureJwtGuard`-Kommentar/ADR-6): Die dafür
 * nötigen Application-Permissions (`User.Read.All`, `Application.Read.All`,
 * `AppRoleAssignment.ReadWrite.All`) erfordern Admin-Consent und ein Client-Secret, das niemals
 * im Frontend-Bundle landen darf.
 */
@Injectable()
export class GraphService {
  private readonly client: Client;
  private readonly clientId: string;
  private servicePrincipalCache: ServicePrincipal | null = null;

  constructor(private readonly configService: ConfigService) {
    const tenantId = this.configService.getOrThrow<string>('AZURE_TENANT_ID');
    this.clientId = this.configService.getOrThrow<string>('AZURE_CLIENT_ID');
    const clientSecret = this.configService.getOrThrow<string>('AZURE_CLIENT_SECRET');

    const credential = new ClientSecretCredential(tenantId, this.clientId, clientSecret);
    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
      scopes: ['https://graph.microsoft.com/.default'],
    });
    this.client = Client.initWithMiddleware({ authProvider });
  }

  async listUsers(): Promise<GraphUser[]> {
    const response = (await this.client
      .api('/users')
      .select('id,displayName,mail,userPrincipalName')
      .top(999)
      .get()) as { value: GraphUser[] };
    return response.value;
  }

  /**
   * Löst den Barcode einer bestehenden Mitarbeiterausweiskarte gegen das `employeeId`-Attribut
   * auf (siehe ADR-7, "Weg A" - Badge-Scan zur Identifikation, Passwort zur Authentifizierung).
   * Einfache Anführungszeichen werden verdoppelt (OData-Escaping) - zusätzlich zur strikten
   * Formatprüfung in `BadgeLoginService`, nicht als einziger Schutz gegen Filter-Injection.
   */
  async findUserByEmployeeId(employeeId: string): Promise<GraphUser | null> {
    const escapedEmployeeId = employeeId.replace(/'/g, "''");
    const response = (await this.client
      .api('/users')
      .filter(`employeeId eq '${escapedEmployeeId}'`)
      .select('id,displayName,mail,userPrincipalName')
      .get()) as { value: GraphUser[] };
    return response.value[0] ?? null;
  }

  async listAppRoleAssignments(): Promise<AppRoleAssignment[]> {
    const servicePrincipal = await this.getServicePrincipal();
    const response = (await this.client
      .api(`/servicePrincipals/${servicePrincipal.id}/appRoleAssignedTo`)
      .get()) as { value: AppRoleAssignment[] };
    return response.value;
  }

  async getAppRoles(): Promise<AppRole[]> {
    const servicePrincipal = await this.getServicePrincipal();
    return servicePrincipal.appRoles;
  }

  async assignRole(userId: string, appRoleId: string): Promise<void> {
    const servicePrincipal = await this.getServicePrincipal();
    await this.client.api(`/servicePrincipals/${servicePrincipal.id}/appRoleAssignedTo`).post({
      principalId: userId,
      resourceId: servicePrincipal.id,
      appRoleId,
    });
  }

  async removeRoleAssignment(assignmentId: string): Promise<void> {
    const servicePrincipal = await this.getServicePrincipal();
    await this.client
      .api(`/servicePrincipals/${servicePrincipal.id}/appRoleAssignedTo/${assignmentId}`)
      .delete();
  }

  /** appRoles ändern sich praktisch nie zur Laufzeit - Object-ID + Rollen-Liste pro Prozess cachen. */
  private async getServicePrincipal(): Promise<ServicePrincipal> {
    if (this.servicePrincipalCache) {
      return this.servicePrincipalCache;
    }
    const response = (await this.client
      .api('/servicePrincipals')
      .filter(`appId eq '${this.clientId}'`)
      .select('id,appRoles')
      .get()) as { value: ServicePrincipal[] };

    const servicePrincipal = response.value[0];
    if (!servicePrincipal) {
      throw new Error(`No service principal found for appId ${this.clientId}`);
    }
    this.servicePrincipalCache = servicePrincipal;
    return servicePrincipal;
  }
}
