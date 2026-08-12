import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import {
  DEVICE_TOKEN_TTL_SECONDS,
  SESSION_TOKEN_TTL_SECONDS,
  TABLET_TOKEN_ISSUER,
  TabletTokenUse,
} from './tablet-auth.constants';

export interface TabletTokenClaims {
  sub: string;
  badgeCode: string;
  displayName: string;
  upn: string;
  roles: string[];
  tokenUse: TabletTokenUse;
}

/**
 * Signiert/prüft die beiden eigenen (nicht von Entra ausgestellten) JWTs für Tablet-Sitzungen
 * (siehe ADR-12): das kurzlebige Session-Token fürs Frontend und das langlebige Device-Token für
 * den "1 Jahr keinen PIN mehr abfragen"-Flow. Bewusst symmetrisch signiert (HS256) mit einem
 * eigenen Secret statt Entras RS256/JWKS - dieses Token stammt ja gerade NICHT von Entra, es wird
 * ausschließlich von diesem Backend selbst ausgestellt und geprüft.
 */
@Injectable()
export class TabletSessionTokenService {
  constructor(private readonly configService: ConfigService) {}

  issueSessionToken(claims: Omit<TabletTokenClaims, 'tokenUse'>): string {
    return this.sign({ ...claims, tokenUse: 'tablet-session' }, SESSION_TOKEN_TTL_SECONDS);
  }

  issueDeviceToken(claims: Omit<TabletTokenClaims, 'tokenUse'>): string {
    return this.sign({ ...claims, tokenUse: 'tablet-device' }, DEVICE_TOKEN_TTL_SECONDS);
  }

  verifyDeviceToken(token: string): TabletTokenClaims {
    const claims = this.verify(token);
    if (claims.tokenUse !== 'tablet-device') {
      throw new UnauthorizedException('Not a device token');
    }
    return claims;
  }

  private sign(claims: TabletTokenClaims, expiresInSeconds: number): string {
    return jwt.sign(claims, this.secret(), {
      expiresIn: expiresInSeconds,
      issuer: TABLET_TOKEN_ISSUER,
    });
  }

  private verify(token: string): TabletTokenClaims {
    try {
      return jwt.verify(token, this.secret(), {
        algorithms: ['HS256'],
        issuer: TABLET_TOKEN_ISSUER,
      }) as unknown as TabletTokenClaims;
    } catch {
      throw new UnauthorizedException('Invalid or expired device token');
    }
  }

  private secret(): string {
    const secret = this.configService.get<string>('TABLET_SESSION_JWT_SECRET');
    if (!secret) {
      throw new ServiceUnavailableException(
        'Tablet login is not configured for this cluster (TABLET_SESSION_JWT_SECRET missing)',
      );
    }
    return secret;
  }
}
