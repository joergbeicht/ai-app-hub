import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  IamAccessDeniedError,
  IamClientService,
  IamUnavailableError,
} from '../../iam/iam-client.service';
import { resolveHubAccess, type HubAccess } from '../../iam/hub-access';
import { AuthSessionService, type ActiveSession } from './auth-session.service';
import { ACCESS_RECHECK_INTERVAL_MS, ACCESS_TOKEN_REFRESH_MARGIN_MS } from './bff.constants';
import { OidcClientService, OidcSessionEndedError } from './oidc-client.service';

/**
 * Hält eine laufende Sitzung aktuell (ADR-20): erneuert das Access-Token kurz vor Ablauf und
 * gleicht die Rechte spätestens alle 30 Sekunden mit der Axora IAM ab. Entziehen Keycloak oder
 * die IAM den Zugriff, endet die Sitzung; ist die IAM nicht erreichbar, wird abgelehnt (fail closed).
 */
@Injectable()
export class SessionAccessService {
  private readonly logger = new Logger(SessionAccessService.name);

  constructor(
    private readonly sessions: AuthSessionService,
    private readonly oidc: OidcClientService,
    private readonly iam: IamClientService,
  ) {}

  async ensureCurrent(session: ActiveSession): Promise<ActiveSession> {
    const now = Date.now();
    let current = session;
    if (current.accessTokenExpiresAt.getTime() - now <= ACCESS_TOKEN_REFRESH_MARGIN_MS) {
      current = await this.refreshTokens(current);
    }
    if (now - current.accessCheckedAt.getTime() >= ACCESS_RECHECK_INTERVAL_MS) {
      current = await this.recheckAccess(current);
    }
    return current;
  }

  private async refreshTokens(session: ActiveSession): Promise<ActiveSession> {
    try {
      return await this.sessions.storeTokens(session, await this.oidc.refresh(session.refreshToken));
    } catch (error) {
      if (error instanceof OidcSessionEndedError) {
        return this.endSession(session, `token refresh rejected (${error.reason})`);
      }
      this.logger.error(`Token refresh failed: ${errorMessage(error)}`);
      throw new ServiceUnavailableException('Identity provider unavailable');
    }
  }

  private async recheckAccess(session: ActiveSession): Promise<ActiveSession> {
    const access = await this.fetchAccess(session);
    if (!access) {
      return this.endSession(session, 'hub access revoked in IAM');
    }
    return this.sessions.storeAccess(session, access);
  }

  private async fetchAccess(session: ActiveSession): Promise<HubAccess | null> {
    try {
      return resolveHubAccess(await this.iam.getMe(session.accessToken), session.organizationId);
    } catch (error) {
      if (error instanceof IamAccessDeniedError) {
        return this.endSession(session, `IAM denied access (${error.status})`);
      }
      if (error instanceof IamUnavailableError) {
        this.logger.error(`IAM check failed: ${error.message}`);
        throw new ServiceUnavailableException('Authorization service unavailable');
      }
      throw error;
    }
  }

  private async endSession(session: ActiveSession, reason: string): Promise<never> {
    this.logger.warn(`Ending session: ${reason}`);
    await this.sessions.deleteSession(session.id);
    throw new UnauthorizedException('Session ended');
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
