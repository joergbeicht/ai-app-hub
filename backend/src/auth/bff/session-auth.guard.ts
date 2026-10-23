import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../hub-principal';
import { BFF_CONFIG, type BffConfig } from './bff-config';
import { CSRF_HEADER, SAFE_HTTP_METHODS, SESSION_COOKIE } from './bff.constants';
import { AuthSessionService, type ActiveSession } from './auth-session.service';
import { readCookie } from './session-cookie';
import { tokensEqual } from './secure-token';

export interface SessionRequest extends AuthenticatedRequest {
  authSession: ActiveSession;
}

/**
 * Prüft die Hub-Sitzung aus dem HttpOnly-Cookie (ADR-19). Schreibende Requests brauchen
 * zusätzlich das CSRF-Token der Sitzung im Header und dürfen nur vom eigenen Frontend kommen.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly sessions: AuthSessionService,
    @Inject(BFF_CONFIG) private readonly config: BffConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SessionRequest>();
    const session = await this.sessions.findActiveSession(readCookie(request, SESSION_COOKIE));
    if (!session) {
      throw new UnauthorizedException('No active session');
    }
    if (!SAFE_HTTP_METHODS.has(request.method)) {
      this.assertTrustedWrite(request, session);
    }

    request.authSession = session;
    request.user = {
      sub: session.subject,
      name: session.displayName,
      email: session.email ?? undefined,
      roles: session.roles,
    };
    return true;
  }

  private assertTrustedWrite(request: SessionRequest, session: ActiveSession): void {
    const origin = request.headers.origin;
    if (origin !== undefined && origin !== this.config.frontendUrl) {
      throw new ForbiddenException('Request origin is not allowed');
    }
    const csrfToken = request.headers[CSRF_HEADER];
    if (typeof csrfToken !== 'string' || !tokensEqual(csrfToken, session.csrfToken)) {
      throw new ForbiddenException('Missing or invalid CSRF token');
    }
  }
}
