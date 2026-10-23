import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import {
  IamAccessDeniedError,
  IamUnavailableError,
  type IamClientService,
  type IamMe,
} from '../../iam/iam-client.service';
import type { ActiveSession, AuthSessionService, SessionTokens } from './auth-session.service';
import { ACCESS_RECHECK_INTERVAL_MS, ACCESS_TOKEN_REFRESH_MARGIN_MS } from './bff.constants';
import { OidcSessionEndedError, type OidcClientService } from './oidc-client.service';
import { SessionAccessService } from './session-access.service';

const NOW = new Date('2026-10-23T12:00:00Z');

function sessionWith(overrides: Partial<ActiveSession> = {}): ActiveSession {
  return {
    id: 'session-id',
    subject: 'kc-user-1',
    displayName: 'Ada',
    email: null,
    csrfToken: 'csrf',
    organizationId: 'org-1',
    organizationName: 'Axora',
    permissions: ['hub.catalog.read'],
    roles: ['User'],
    accessCheckedAt: NOW,
    accessToken: 'access-token',
    accessTokenExpiresAt: new Date(NOW.getTime() + 5 * 60 * 1000),
    refreshToken: 'refresh-token',
    ...overrides,
  };
}

function meWith(permissions: string[]): IamMe {
  return {
    principal: { id: 'p-1', displayName: 'Ada', email: null },
    organizations: [
      {
        id: 'org-1',
        slug: 'axora',
        name: 'Axora',
        membershipStatus: 'ACTIVE',
        applications: ['ai-app-hub'],
        permissions,
      },
    ],
  };
}

const refreshedTokens: SessionTokens = {
  accessToken: 'new-access-token',
  accessTokenExpiresAt: new Date(NOW.getTime() + 5 * 60 * 1000),
  refreshToken: 'new-refresh-token',
};

function createService() {
  const sessions = {
    storeTokens: jest.fn(async (session: ActiveSession, tokens: SessionTokens) => ({
      ...session,
      accessToken: tokens.accessToken,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      refreshToken: tokens.refreshToken,
    })),
    storeAccess: jest.fn(async (session: ActiveSession, access: object) => ({
      ...session,
      ...access,
      accessCheckedAt: NOW,
    })),
    deleteSession: jest.fn().mockResolvedValue(undefined),
  };
  const oidc = { refresh: jest.fn().mockResolvedValue(refreshedTokens) };
  const iam = { getMe: jest.fn().mockResolvedValue(meWith(['hub.catalog.read', 'hub.catalog.manage'])) };
  const service = new SessionAccessService(
    sessions as unknown as AuthSessionService,
    oidc as unknown as OidcClientService,
    iam as unknown as IamClientService,
  );
  return { service, sessions, oidc, iam };
}

const staleAccess = { accessCheckedAt: new Date(NOW.getTime() - ACCESS_RECHECK_INTERVAL_MS) };
const expiringToken = {
  accessTokenExpiresAt: new Date(NOW.getTime() + ACCESS_TOKEN_REFRESH_MARGIN_MS),
};

describe('SessionAccessService', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('leaves a fresh session untouched', async () => {
    const { service, oidc, iam } = createService();
    const session = sessionWith();

    await expect(service.ensureCurrent(session)).resolves.toBe(session);
    expect(oidc.refresh).not.toHaveBeenCalled();
    expect(iam.getMe).not.toHaveBeenCalled();
  });

  it('refreshes the access token shortly before it expires', async () => {
    const { service, oidc, sessions } = createService();

    const current = await service.ensureCurrent(sessionWith(expiringToken));

    expect(oidc.refresh).toHaveBeenCalledWith('refresh-token');
    expect(sessions.storeTokens).toHaveBeenCalled();
    expect(current.accessToken).toBe('new-access-token');
  });

  it('rechecks IAM with the refreshed token and updates the derived roles', async () => {
    const { service, iam } = createService();

    const current = await service.ensureCurrent(sessionWith({ ...expiringToken, ...staleAccess }));

    expect(iam.getMe).toHaveBeenCalledWith('new-access-token');
    expect(current.roles).toEqual(['Administrator']);
    expect(current.permissions).toEqual(['hub.catalog.read', 'hub.catalog.manage']);
  });

  it('ends the session when Keycloak rejects the refresh token', async () => {
    const { service, oidc, sessions } = createService();
    oidc.refresh.mockRejectedValue(new OidcSessionEndedError('invalid_grant'));

    await expect(service.ensureCurrent(sessionWith(expiringToken))).rejects.toThrow(UnauthorizedException);
    expect(sessions.deleteSession).toHaveBeenCalledWith('session-id');
  });

  it('keeps the session but rejects the request when Keycloak is unreachable', async () => {
    const { service, oidc, sessions } = createService();
    oidc.refresh.mockRejectedValue(new Error('connect ECONNREFUSED'));

    await expect(service.ensureCurrent(sessionWith(expiringToken))).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(sessions.deleteSession).not.toHaveBeenCalled();
  });

  it('ends the session when the hub permission was revoked in IAM', async () => {
    const { service, iam, sessions } = createService();
    iam.getMe.mockResolvedValue(meWith(['iam.user.read']));

    await expect(service.ensureCurrent(sessionWith(staleAccess))).rejects.toThrow(UnauthorizedException);
    expect(sessions.deleteSession).toHaveBeenCalledWith('session-id');
  });

  it('ends the session when IAM no longer accepts the principal', async () => {
    const { service, iam, sessions } = createService();
    iam.getMe.mockRejectedValue(new IamAccessDeniedError(403));

    await expect(service.ensureCurrent(sessionWith(staleAccess))).rejects.toThrow(UnauthorizedException);
    expect(sessions.deleteSession).toHaveBeenCalledWith('session-id');
  });

  it('fails closed without ending the session when IAM is unavailable', async () => {
    const { service, iam, sessions } = createService();
    iam.getMe.mockRejectedValue(new IamUnavailableError('timeout'));

    await expect(service.ensureCurrent(sessionWith(staleAccess))).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(sessions.deleteSession).not.toHaveBeenCalled();
    expect(sessions.storeAccess).not.toHaveBeenCalled();
  });
});
