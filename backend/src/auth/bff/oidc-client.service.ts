import type { IncomingMessage } from 'node:http';
import { Inject, Injectable } from '@nestjs/common';
import {
  Issuer,
  custom,
  errors,
  generators,
  type Client,
  type IdTokenClaims,
  type TokenSet,
} from 'openid-client';
import { BFF_CONFIG, type BffConfig } from './bff-config';
import { OIDC_CLOCK_TOLERANCE_SECONDS, OIDC_SCOPES } from './bff.constants';
import type { LoginTransaction, SessionIdentity, SessionTokens } from './auth-session.service';

export interface ExchangedCode {
  identity: SessionIdentity;
  tokens: SessionTokens;
}

export class OidcSessionEndedError extends Error {
  constructor(readonly reason: string) {
    super(`Keycloak session ended: ${reason}`);
  }
}

/**
 * OIDC-Client des BFF gegen Keycloak: Authorization Code + PKCE (S256), vertraulicher Client.
 * `openid-client` prüft beim Callback state, nonce, `iss`-Parameter und das ID-Token selbst
 * (Signatur über JWKS, `iss`, `aud`, `exp`, Algorithmus).
 *
 * Die Discovery passiert erst beim ersten Login, damit das Backend unabhängig von Keycloak startet.
 * Schlägt sie fehl, versucht der nächste Login es erneut.
 */
@Injectable()
export class OidcClientService {
  private clientPromise: Promise<Client> | null = null;

  constructor(@Inject(BFF_CONFIG) private readonly config: BffConfig) {}

  async authorizationUrl(transaction: LoginTransaction): Promise<string> {
    const client = await this.client();
    return client.authorizationUrl({
      scope: OIDC_SCOPES,
      state: transaction.state,
      nonce: transaction.nonce,
      code_challenge: generators.codeChallenge(transaction.codeVerifier),
      code_challenge_method: 'S256',
    });
  }

  async exchangeCode(
    callbackRequest: IncomingMessage,
    transaction: LoginTransaction,
  ): Promise<ExchangedCode> {
    const client = await this.client();
    const params = client.callbackParams(callbackRequest);
    const tokenSet = await client.callback(this.config.redirectUri, params, {
      response_type: 'code',
      state: transaction.state,
      nonce: transaction.nonce,
      code_verifier: transaction.codeVerifier,
    });
    if (!tokenSet.id_token) {
      throw new Error('Token response contains no ID token');
    }
    return {
      identity: toSessionIdentity(tokenSet.claims(), tokenSet.id_token),
      tokens: toSessionTokens(tokenSet),
    };
  }

  /**
   * Erneuert das Access-Token. Ein `OidcSessionEndedError` bedeutet, dass Keycloak die Sitzung
   * beendet hat (Logout, Sperre, Ablauf); andere Fehler sind technische Störungen.
   */
  async refresh(refreshToken: string): Promise<SessionTokens> {
    const client = await this.client();
    try {
      return toSessionTokens(await client.refresh(refreshToken));
    } catch (error) {
      if (error instanceof errors.OPError) {
        throw new OidcSessionEndedError(error.error ?? 'unknown');
      }
      throw error;
    }
  }

  async endSessionUrl(idToken: string | null): Promise<string> {
    const client = await this.client();
    return client.endSessionUrl({
      client_id: this.config.clientId,
      post_logout_redirect_uri: this.config.postLogoutRedirectUri,
      ...(idToken ? { id_token_hint: idToken } : {}),
    });
  }

  private client(): Promise<Client> {
    this.clientPromise ??= this.discover().catch((error: unknown) => {
      this.clientPromise = null;
      throw error;
    });
    return this.clientPromise;
  }

  private async discover(): Promise<Client> {
    const issuer = await Issuer.discover(this.config.discoveryUrl);
    if (issuer.metadata.issuer !== this.config.issuerUrl) {
      throw new Error(
        `OIDC issuer mismatch: expected ${this.config.issuerUrl}, discovery returned ${issuer.metadata.issuer}`,
      );
    }
    const client = new issuer.Client({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uris: [this.config.redirectUri],
      post_logout_redirect_uris: [this.config.postLogoutRedirectUri],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_basic',
      id_token_signed_response_alg: 'RS256',
    });
    client[custom.clock_tolerance] = OIDC_CLOCK_TOLERANCE_SECONDS;
    return client;
  }
}

function toSessionIdentity(claims: IdTokenClaims, idToken: string): SessionIdentity {
  const email = typeof claims.email === 'string' ? claims.email : null;
  const displayName =
    stringClaim(claims.name) ?? stringClaim(claims.preferred_username) ?? email ?? claims.sub;
  return { subject: claims.sub, displayName, email, idToken };
}

function toSessionTokens(tokenSet: TokenSet): SessionTokens {
  if (!tokenSet.access_token || !tokenSet.refresh_token || tokenSet.expires_at === undefined) {
    throw new Error('Token response lacks access token, refresh token or expiry');
  }
  return {
    accessToken: tokenSet.access_token,
    accessTokenExpiresAt: new Date(tokenSet.expires_at * 1000),
    refreshToken: tokenSet.refresh_token,
    ...(tokenSet.id_token ? { idToken: tokenSet.id_token } : {}),
  };
}

function stringClaim(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
