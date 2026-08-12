import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';
import { backendApiScopeUri } from './backend-api-scope';

interface RopcTokenResponse {
  id_token: string;
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface EntraIdTokenClaims {
  sub: string;
  oid?: string;
  name?: string;
  preferred_username?: string;
  roles?: string[];
}

/**
 * Führt den Resource-Owner-Password-Credentials(ROPC)-Flow gegen Entra ID aus (siehe ADR-12):
 * Das Backend tauscht Benutzername + das in Key Vault gespeicherte echte Passwort direkt gegen
 * Tokens, ohne den Nutzer auf `login.microsoftonline.com` zu schicken. Nutzt dieselbe
 * App-Registrierung (Client-ID/-Secret) wie `GraphService` - ROPC ist auch für "confidential
 * clients" (mit Client-Secret) zulässig, nicht nur für native/public Clients.
 *
 * Schlägt hart fehl, sobald für den Benutzer eine Conditional-Access-Regel mit MFA greift (siehe
 * ADR-12, "Bekannte Trade-offs") - das ist beabsichtigt: die `AI-App-Hub-Tablet-Users`-Gruppe muss
 * betrieblich von solchen Regeln ausgenommen bleiben.
 */
@Injectable()
export class RopcTokenService {
  private readonly logger = new Logger(RopcTokenService.name);
  private readonly jwksClientsByTenant = new Map<string, JwksClient>();

  constructor(private readonly configService: ConfigService) {}

  async signInWithPassword(
    userPrincipalName: string,
    password: string,
  ): Promise<EntraIdTokenClaims> {
    const tenantId = this.configService.getOrThrow<string>('AZURE_TENANT_ID');
    const clientId = this.configService.getOrThrow<string>('AZURE_CLIENT_ID');
    const clientSecret = this.configService.getOrThrow<string>('AZURE_CLIENT_SECRET');

    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: clientId,
      client_secret: clientSecret,
      username: userPrincipalName,
      password,
      scope: `openid profile ${backendApiScopeUri(clientId)}`,
    });

    const response = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.warn(
        `ROPC sign-in failed for ${userPrincipalName}: ${response.status} ${errorBody}`,
      );
      throw new UnauthorizedException('Entra sign-in failed for this account');
    }

    const tokens = (await response.json()) as RopcTokenResponse;
    return this.verifyIdToken(tokens.id_token, tenantId, clientId);
  }

  /**
   * Prüft das von Entra ausgestellte ID-Token genauso streng wie `AzureJwtGuard` das Access Token
   * eines normalen PC-Logins (Signatur über JWKS, Issuer, Audience, Expiry) - kein blindes
   * Vertrauen nur weil die Antwort direkt von `login.microsoftonline.com` kam.
   */
  private verifyIdToken(
    idToken: string,
    tenantId: string,
    clientId: string,
  ): Promise<EntraIdTokenClaims> {
    const jwksClient = this.getJwksClient(tenantId);
    return new Promise((resolve, reject) => {
      jwt.verify(
        idToken,
        (header, callback) => {
          if (!header.kid) {
            callback(new Error('Token header has no kid'));
            return;
          }
          jwksClient
            .getSigningKey(header.kid)
            .then((key) => callback(null, key.getPublicKey()))
            .catch((err: Error) => callback(err));
        },
        {
          algorithms: ['RS256'],
          issuer: [
            `https://login.microsoftonline.com/${tenantId}/v2.0`,
            `https://sts.windows.net/${tenantId}/`,
          ],
          audience: clientId,
        },
        (err, decoded) => {
          if (err || !decoded) {
            reject(new UnauthorizedException('Invalid ID token received from Entra'));
            return;
          }
          resolve(decoded as EntraIdTokenClaims);
        },
      );
    });
  }

  private getJwksClient(tenantId: string): JwksClient {
    const existing = this.jwksClientsByTenant.get(tenantId);
    if (existing) {
      return existing;
    }
    const client = new JwksClient({
      jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
      cache: true,
      cacheMaxAge: 24 * 60 * 60 * 1000,
    });
    this.jwksClientsByTenant.set(tenantId, client);
    return client;
  }
}
