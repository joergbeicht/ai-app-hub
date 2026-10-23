import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { AuthSessionService, ActiveSession } from './auth-session.service';
import type { BffConfig } from './bff-config';
import type { SessionAccessService } from './session-access.service';
import { SessionAuthGuard, SessionCookieGuard, type SessionRequest } from './session-auth.guard';

const FRONTEND_URL = 'https://localhost:6054';

const activeSession: ActiveSession = {
  id: 'session-id',
  subject: 'kc-user-1',
  displayName: 'Hub Administrator',
  email: 'admin@axora.local',
  roles: ['Administrator'],
  permissions: ['hub.catalog.manage', 'hub.catalog.read'],
  organizationId: 'org-1',
  organizationName: 'Axora',
  csrfToken: 'csrf-token',
  accessCheckedAt: new Date(0),
  accessToken: 'access-token',
  accessTokenExpiresAt: new Date(0),
  refreshToken: 'refresh-token',
};

interface RequestOptions {
  method?: string;
  origin?: string;
  csrf?: string;
  cookie?: string;
}

function createRequest({ method = 'GET', origin, csrf, cookie = 'handle' }: RequestOptions = {}) {
  const headers: Record<string, string> = {};
  if (origin) headers.origin = origin;
  if (csrf) headers['x-csrf-token'] = csrf;
  return { method, headers, cookies: { '__Host-hub_session': cookie } } as unknown as SessionRequest;
}

function contextFor(request: SessionRequest): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

function createGuards(session: ActiveSession | null) {
  const sessions = { findActiveSession: jest.fn().mockResolvedValue(session) };
  const sessionAccess = {
    ensureCurrent: jest.fn(async (current: ActiveSession) => ({ ...current, roles: ['User'] })),
  };
  const config = { frontendUrl: FRONTEND_URL } as BffConfig;
  const store = sessions as unknown as AuthSessionService;
  return {
    guard: new SessionAuthGuard(store, sessionAccess as unknown as SessionAccessService, config),
    cookieGuard: new SessionCookieGuard(store, config),
    sessions,
    sessionAccess,
  };
}

describe('SessionAuthGuard', () => {
  it('rejects requests without an active session', async () => {
    const { guard, sessionAccess } = createGuards(null);

    await expect(guard.canActivate(contextFor(createRequest()))).rejects.toThrow(UnauthorizedException);
    expect(sessionAccess.ensureCurrent).not.toHaveBeenCalled();
  });

  it('attaches the refreshed principal for read requests without CSRF token', async () => {
    const { guard, sessions, sessionAccess } = createGuards(activeSession);
    const request = createRequest();

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

    expect(sessions.findActiveSession).toHaveBeenCalledWith('handle');
    expect(sessionAccess.ensureCurrent).toHaveBeenCalledWith(activeSession);
    expect(request.user).toEqual({
      sub: 'kc-user-1',
      name: 'Hub Administrator',
      email: 'admin@axora.local',
      roles: ['User'],
    });
    expect(request.authSession.roles).toEqual(['User']);
  });

  it('accepts writes from the frontend origin with a matching CSRF token', async () => {
    const { guard } = createGuards(activeSession);
    const request = createRequest({ method: 'PUT', origin: FRONTEND_URL, csrf: 'csrf-token' });

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
  });

  it.each([
    ['without CSRF token', { method: 'POST', origin: FRONTEND_URL }],
    ['with a wrong CSRF token', { method: 'DELETE', origin: FRONTEND_URL, csrf: 'other-token' }],
    ['from a foreign origin', { method: 'PUT', origin: 'https://evil.example', csrf: 'csrf-token' }],
  ])('rejects writes %s before touching IAM', async (_label, options) => {
    const { guard, sessionAccess } = createGuards(activeSession);

    await expect(guard.canActivate(contextFor(createRequest(options)))).rejects.toThrow(ForbiddenException);
    expect(sessionAccess.ensureCurrent).not.toHaveBeenCalled();
  });
});

describe('SessionCookieGuard', () => {
  it('accepts the session without refreshing tokens or IAM access', async () => {
    const { cookieGuard, sessionAccess } = createGuards(activeSession);
    const request = createRequest({ method: 'POST', origin: FRONTEND_URL, csrf: 'csrf-token' });

    await expect(cookieGuard.canActivate(contextFor(request))).resolves.toBe(true);

    expect(sessionAccess.ensureCurrent).not.toHaveBeenCalled();
    expect(request.authSession).toBe(activeSession);
  });

  it('still requires the CSRF token for writes', async () => {
    const { cookieGuard } = createGuards(activeSession);

    await expect(
      cookieGuard.canActivate(contextFor(createRequest({ method: 'POST', origin: FRONTEND_URL }))),
    ).rejects.toThrow(ForbiddenException);
  });
});
