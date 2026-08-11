import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';
import type { Request } from 'express';

export interface AzureTokenClaims {
  sub: string;
  oid?: string;
  preferred_username?: string;
  name?: string;
  roles?: string[];
  iss: string;
  aud: string;
  exp: number;
}

/** Express Request, angereichert um die geprüften Token-Claims (siehe `azure-jwt.guard.ts`). */
export interface AuthenticatedRequest extends Request {
  user: AzureTokenClaims;
}

/**
 * Validiert das Access Token jeder eingehenden Anfrage selbst (Signatur über Azure-AD-JWKS,
 * Issuer, Audience, Expiry) - kein "Trust", nur weil das Frontend/MSAL das Token schon geprüft
 * hat (siehe `platform-architecture.mdc`: "Jeder Baustein validiert eingehende Tokens selbst").
 *
 * Tenant-ID/Client-ID kommen aus ENV (`AZURE_TENANT_ID`/`AZURE_CLIENT_ID`), nicht aus
 * Compile-Konstanten - aus demselben Grund wie beim Frontend (`core/runtime-config.ts`): jeder
 * Kunde hat seinen eigenen Azure-Tenant, das Backend-Image darf dafür nicht neu gebaut werden.
 */
@Injectable()
export class AzureJwtGuard implements CanActivate {
  private readonly logger = new Logger(AzureJwtGuard.name);
  private readonly jwksClient: JwksClient;
  private readonly tenantId: string;
  private readonly audience: [string, string];

  constructor(private readonly configService: ConfigService) {
    this.tenantId = this.configService.getOrThrow<string>('AZURE_TENANT_ID');
    const clientId = this.configService.getOrThrow<string>('AZURE_CLIENT_ID');
    // Für den eigenen "Expose an API"-Scope (`access_as_user`) setzt Azure AD die `aud`-Claim auf
    // die App-ID-URI (`api://<client-id>`), nicht auf die rohe Client-ID (GUID) - beide Formen
    // akzeptieren, statt uns auf ein bestimmtes Azure-Verhalten zu verlassen.
    this.audience = [clientId, `api://${clientId}`];
    this.jwksClient = new JwksClient({
      jwksUri: `https://login.microsoftonline.com/${this.tenantId}/discovery/v2.0/keys`,
      cache: true,
      cacheMaxAge: 24 * 60 * 60 * 1000,
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);

    try {
      const claims = await this.verifyToken(token);
      request.user = claims;
      return true;
    } catch (error) {
      this.logger.warn(`Token-Validierung fehlgeschlagen: ${(error as Error).message}`);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractBearerToken(request: Request): string {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token');
    }
    return header.slice('Bearer '.length);
  }

  private verifyToken(token: string): Promise<AzureTokenClaims> {
    return new Promise((resolve, reject) => {
      jwt.verify(
        token,
        (header, callback) => {
          if (!header.kid) {
            callback(new Error('Token header has no kid'));
            return;
          }
          this.jwksClient
            .getSigningKey(header.kid)
            .then((key) => callback(null, key.getPublicKey()))
            .catch((err: Error) => callback(err));
        },
        {
          algorithms: ['RS256'],
          issuer: [
            `https://login.microsoftonline.com/${this.tenantId}/v2.0`,
            `https://sts.windows.net/${this.tenantId}/`,
          ],
          audience: this.audience,
        },
        (err, decoded) => {
          if (err || !decoded) {
            reject(err ?? new Error('Token could not be decoded'));
            return;
          }
          resolve(decoded as AzureTokenClaims);
        },
      );
    });
  }
}
