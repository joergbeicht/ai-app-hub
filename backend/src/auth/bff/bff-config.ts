import type { ConfigService } from '@nestjs/config';

export const BFF_CONFIG = Symbol('BFF_CONFIG');

/**
 * Einstellungen des Keycloak-BFF (ADR-19). `issuerUrl` ist der Issuer in den Tokens (öffentliche
 * Keycloak-URL), `discoveryUrl` die Adresse, unter der das Backend Keycloak selbst erreicht
 * (lokal `http://keycloak:8080/...`, sonst gleich dem Issuer).
 */
export interface BffConfig {
  readonly issuerUrl: string;
  readonly discoveryUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
  readonly frontendUrl: string;
  readonly postLogoutRedirectUri: string;
}

export function createBffConfig(config: ConfigService): BffConfig {
  const issuerUrl = config.getOrThrow<string>('OIDC_ISSUER_URL');
  const frontendUrl = withoutTrailingSlash(config.getOrThrow<string>('FRONTEND_URL'));
  return {
    issuerUrl,
    discoveryUrl: config.get<string>('OIDC_DISCOVERY_URL') || issuerUrl,
    clientId: config.getOrThrow<string>('OIDC_CLIENT_ID'),
    clientSecret: config.getOrThrow<string>('OIDC_CLIENT_SECRET'),
    redirectUri: config.getOrThrow<string>('OIDC_REDIRECT_URI'),
    frontendUrl,
    postLogoutRedirectUri:
      config.get<string>('OIDC_POST_LOGOUT_REDIRECT_URI') || `${frontendUrl}/login`,
  };
}

function withoutTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}
