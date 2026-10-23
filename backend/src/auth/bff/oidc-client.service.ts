import type { IncomingMessage } from 'node:http';
import { Inject, Injectable } from '@nestjs/common';
import { Issuer, custom, generators, type Client, type IdTokenClaims } from 'openid-client';
import { BFF_CONFIG, type BffConfig } from './bff-config';
import { OIDC_CLOCK_TOLERANCE_SECONDS, OIDC_SCOPES } from './bff.constants';
import type { LoginTransaction, SessionIdentity } from './auth-session.service';

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
  ): Promise<SessionIdentity> {
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
    return toSessionIdentity(tokenSet.claims(), tokenSet.id_token);
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
  return {
    subject: claims.sub,
    displayName,
    email,
    roles: stringArrayClaim(claims['roles']),
    idToken,
  };
}

function stringClaim(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function stringArrayClaim(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
