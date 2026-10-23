import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { AuthSessionService, ActiveSession } from './auth-session.service';
import type { BffConfig } from './bff-config';
import { SessionAuthGuard, type SessionRequest } from './session-auth.guard';

const FRONTEND_URL = 'https://localhost:6054';

const activeSession: ActiveSession = {
  subject: 'kc-user-1',
  displayName: 'Hub Administrator',
  email: 'admin@axora.local',
  roles: ['Administrator'],
  csrfToken: 'csrf-token',
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

function createGuard(session: ActiveSession | null) {
  const sessions = { findActiveSession: jest.fn().mockResolvedValue(session) };
  const config = { frontendUrl: FRONTEND_URL } as BffConfig;
  return { guard: new SessionAuthGuard(sessions as unknown as AuthSessionService, config), sessions };
}

describe('SessionAuthGuard', () => {
  it('rejects requests without an active session', async () => {
    const { guard } = createGuard(null);

    await expect(guard.canActivate(contextFor(createRequest()))).rejects.toThrow(UnauthorizedException);
  });

  it('attaches the principal for read requests without CSRF token', async () => {
    const { guard, sessions } = createGuard(activeSession);
    const request = createRequest();

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

    expect(sessions.findActiveSession).toHaveBeenCalledWith('handle');
    expect(request.user).toEqual({
      sub: 'kc-user-1',
      name: 'Hub Administrator',
      email: 'admin@axora.local',
      roles: ['Administrator'],
    });
  });

  it('accepts writes from the frontend origin with a matching CSRF token', async () => {
    const { guard } = createGuard(activeSession);
    const request = createRequest({ method: 'PUT', origin: FRONTEND_URL, csrf: 'csrf-token' });

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
  });

  it.each([
    ['without CSRF token', { method: 'POST', origin: FRONTEND_URL }],
    ['with a wrong CSRF token', { method: 'DELETE', origin: FRONTEND_URL, csrf: 'other-token' }],
    ['from a foreign origin', { method: 'PUT', origin: 'https://evil.example', csrf: 'csrf-token' }],
  ])('rejects writes %s', async (_label, options) => {
    const { guard } = createGuard(activeSession);

    await expect(guard.canActivate(contextFor(createRequest(options)))).rejects.toThrow(ForbiddenException);
  });
});
