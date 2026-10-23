import type { IncomingMessage } from 'node:http';
import { Inject, Injectable } from '@nestjs/common';
import { BFF_CONFIG, type BffConfig } from './bff-config';
import { HUB_ENTITLED_ROLES } from './bff.constants';
import { sanitizeReturnTo } from './return-to';
import { AuthSessionService, type ActiveSession } from './auth-session.service';
import { OidcClientService } from './oidc-client.service';
import type { SessionViewDto } from './dto/session-view.dto';

/** Fehlercodes, die das Frontend auf der Login-Seite übersetzt anzeigt (`?error=`). */
export type LoginErrorCode = 'session_expired' | 'not_entitled' | 'login_failed' | 'unavailable';

export class LoginFlowError extends Error {
  constructor(readonly code: LoginErrorCode) {
    super(`Login flow failed: ${code}`);
  }
}

export interface StartedLogin {
  redirectUrl: string;
  transactionHandle: string;
}

export interface CompletedLogin {
  sessionHandle: string;
  expiresAt: Date;
  redirectUrl: string;
}

/**
 * Ablauf des Browser-Logins über Keycloak (ADR-19): Start mit PKCE, Callback mit
 * Code-Tausch, Sitzung anlegen, Logout. Tokens verlassen das Backend nie.
 */
@Injectable()
export class BffAuthService {
  constructor(
    private readonly oidc: OidcClientService,
    private readonly sessions: AuthSessionService,
    @Inject(BFF_CONFIG) private readonly config: BffConfig,
  ) {}

  async beginLogin(rawReturnTo: unknown): Promise<StartedLogin> {
    const transaction = await this.sessions.startLoginTransaction(sanitizeReturnTo(rawReturnTo));
    const redirectUrl = await this.oidc.authorizationUrl(transaction);
    return { redirectUrl, transactionHandle: transaction.handle };
  }

  async completeLogin(
    transactionHandle: string | undefined,
    callbackRequest: IncomingMessage,
  ): Promise<CompletedLogin> {
    const transaction = await this.sessions.consumeLoginTransaction(transactionHandle);
    if (!transaction) {
      throw new LoginFlowError('session_expired');
    }

    const identity = await this.oidc.exchangeCode(callbackRequest, transaction);
    if (!identity.roles.some((role) => isEntitledRole(role))) {
      throw new LoginFlowError('not_entitled');
    }

    const session = await this.sessions.createSession(identity);
    return {
      sessionHandle: session.handle,
      expiresAt: session.expiresAt,
      redirectUrl: `${this.config.frontendUrl}${transaction.returnTo}`,
    };
  }

  /** Beendet die Hub-Sitzung und liefert die Keycloak-Logout-URL für den Browser. */
  async logout(sessionHandle: string | undefined): Promise<string> {
    const idToken = await this.sessions.endSession(sessionHandle);
    return this.oidc.endSessionUrl(idToken);
  }

  loginErrorUrl(code: LoginErrorCode): string {
    return `${this.config.frontendUrl}/login?error=${code}`;
  }

  toSessionView(session: ActiveSession): SessionViewDto {
    return {
      user: {
        id: session.subject,
        displayName: session.displayName,
        email: session.email,
        roles: session.roles,
      },
      csrfToken: session.csrfToken,
    };
  }
}

function isEntitledRole(role: string): boolean {
  return HUB_ENTITLED_ROLES.some((entitled) => entitled === role);
}
