import type { IncomingMessage } from 'node:http';
import { Inject, Injectable } from '@nestjs/common';
import {
  IamAccessDeniedError,
  IamClientService,
  IamUnavailableError,
  type IamMe,
} from '../../iam/iam-client.service';
import { resolveHubAccess, type HubAccess } from '../../iam/hub-access';
import { BFF_CONFIG, type BffConfig } from './bff-config';
import { sanitizeReturnTo } from './return-to';
import { AuthSessionService, type ActiveSession } from './auth-session.service';
import { OidcClientService } from './oidc-client.service';
import type { SessionViewDto } from './dto/session-view.dto';

const ACCOUNT_SECURITY_PATH = '/account/account-security/signing-in';

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
    private readonly iam: IamClientService,
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

    const { identity, tokens } = await this.oidc.exchangeCode(callbackRequest, transaction);
    const access = await this.loadHubAccess(tokens.accessToken);
    const session = await this.sessions.createSession(identity, tokens, access);
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
      organization: { id: session.organizationId, name: session.organizationName },
      permissions: session.permissions,
      csrfToken: session.csrfToken,
      accountSecurityUrl: `${this.config.issuerUrl}${ACCOUNT_SECURITY_PATH}`,
    };
  }

  /** Ohne aktive Mitgliedschaft, Entitlement und `hub.catalog.read` gibt es keine Sitzung (Default Deny). */
  private async loadHubAccess(accessToken: string): Promise<HubAccess> {
    let me: IamMe;
    try {
      me = await this.iam.getMe(accessToken);
    } catch (error) {
      if (error instanceof IamAccessDeniedError) {
        throw new LoginFlowError('not_entitled');
      }
      if (error instanceof IamUnavailableError) {
        throw new LoginFlowError('unavailable');
      }
      throw error;
    }
    const access = resolveHubAccess(me);
    if (!access) {
      throw new LoginFlowError('not_entitled');
    }
    return access;
  }
}
