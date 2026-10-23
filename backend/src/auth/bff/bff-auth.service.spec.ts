import type { IncomingMessage } from 'node:http';
import {
  IamAccessDeniedError,
  IamUnavailableError,
  type IamClientService,
  type IamMe,
} from '../../iam/iam-client.service';
import type {
  ActiveSession,
  AuthSessionService,
  SessionIdentity,
  SessionTokens,
} from './auth-session.service';
import type { BffConfig } from './bff-config';
import { BffAuthService, LoginFlowError } from './bff-auth.service';
import type { OidcClientService } from './oidc-client.service';

const FRONTEND_URL = 'https://localhost:6054';
const ISSUER_URL = 'https://localhost:6057/realms/axora';
const callbackRequest = {} as IncomingMessage;
const transaction = { state: 's', nonce: 'n', codeVerifier: 'v', returnTo: '/settings' };

const identity: SessionIdentity = {
  subject: 'kc-user-1',
  displayName: 'Hub Admin',
  email: null,
  idToken: 'id-token',
};
const tokens: SessionTokens = {
  accessToken: 'access-token',
  accessTokenExpiresAt: new Date(0),
  refreshToken: 'refresh-token',
};

const activeSession: ActiveSession = {
  id: 'session-id',
  subject: 'kc-user-1',
  displayName: 'Hub Admin',
  email: null,
  roles: ['User'],
  permissions: ['hub.catalog.read'],
  organizationId: 'org-1',
  organizationName: 'Axora',
  csrfToken: 'csrf',
  accessCheckedAt: new Date(0),
  ...tokens,
};

function meWith(permissions: string[]): IamMe {
  return {
    principal: { id: 'p-1', displayName: 'Hub Admin', email: null },
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

function createService() {
  const oidc = {
    authorizationUrl: jest.fn().mockResolvedValue('https://kc/auth?x=1'),
    exchangeCode: jest.fn().mockResolvedValue({ identity, tokens }),
    endSessionUrl: jest.fn().mockResolvedValue('https://kc/logout'),
  };
  const sessions = {
    startLoginTransaction: jest.fn(async (returnTo: string) => ({ ...transaction, returnTo, handle: 'tx-handle' })),
    consumeLoginTransaction: jest.fn().mockResolvedValue(transaction),
    createSession: jest.fn().mockResolvedValue({ handle: 'session-handle', expiresAt: new Date(0) }),
    endSession: jest.fn().mockResolvedValue('id-token'),
  };
  const iam = { getMe: jest.fn().mockResolvedValue(meWith(['hub.catalog.read'])) };
  const config = { frontendUrl: FRONTEND_URL, issuerUrl: ISSUER_URL } as BffConfig;
  const service = new BffAuthService(
    oidc as unknown as OidcClientService,
    sessions as unknown as AuthSessionService,
    iam as unknown as IamClientService,
    config,
  );
  return { service, oidc, sessions, iam };
}

async function expectLoginError(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(LoginFlowError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe('BffAuthService', () => {
  it('starts the login with a sanitized return path', async () => {
    const { service, sessions } = createService();

    const started = await service.beginLogin('https://evil.example/');

    expect(sessions.startLoginTransaction).toHaveBeenCalledWith('/');
    expect(started).toEqual({ redirectUrl: 'https://kc/auth?x=1', transactionHandle: 'tx-handle' });
  });

  it('creates a session with the IAM access and returns to the requested page', async () => {
    const { service, oidc, sessions, iam } = createService();

    const completed = await service.completeLogin('tx-handle', callbackRequest);

    expect(oidc.exchangeCode).toHaveBeenCalledWith(callbackRequest, transaction);
    expect(iam.getMe).toHaveBeenCalledWith('access-token');
    expect(sessions.createSession).toHaveBeenCalledWith(identity, tokens, {
      organizationId: 'org-1',
      organizationName: 'Axora',
      permissions: ['hub.catalog.read'],
      roles: ['User'],
    });
    expect(completed.redirectUrl).toBe(`${FRONTEND_URL}/settings`);
    expect(completed.sessionHandle).toBe('session-handle');
  });

  it('reports an expired login when the transaction is gone', async () => {
    const { service, sessions, oidc } = createService();
    sessions.consumeLoginTransaction.mockResolvedValue(null);

    await expectLoginError(service.completeLogin(undefined, callbackRequest), 'session_expired');
    expect(oidc.exchangeCode).not.toHaveBeenCalled();
  });

  it('denies users without hub permission in IAM (default deny)', async () => {
    const { service, iam, sessions } = createService();
    iam.getMe.mockResolvedValue(meWith(['iam.user.read']));

    await expectLoginError(service.completeLogin('tx-handle', callbackRequest), 'not_entitled');
    expect(sessions.createSession).not.toHaveBeenCalled();
  });

  it('denies users that IAM does not know or has suspended', async () => {
    const { service, iam, sessions } = createService();
    iam.getMe.mockRejectedValue(new IamAccessDeniedError(403));

    await expectLoginError(service.completeLogin('tx-handle', callbackRequest), 'not_entitled');
    expect(sessions.createSession).not.toHaveBeenCalled();
  });

  it('fails closed when IAM is unavailable', async () => {
    const { service, iam, sessions } = createService();
    iam.getMe.mockRejectedValue(new IamUnavailableError('connect ECONNREFUSED'));

    await expectLoginError(service.completeLogin('tx-handle', callbackRequest), 'unavailable');
    expect(sessions.createSession).not.toHaveBeenCalled();
  });

  it('ends the session and returns the Keycloak logout URL', async () => {
    const { service, oidc } = createService();

    await expect(service.logout('session-handle')).resolves.toBe('https://kc/logout');
    expect(oidc.endSessionUrl).toHaveBeenCalledWith('id-token');
  });

  it('shows the session without tokens and links to the Keycloak sign-in settings', () => {
    const { service } = createService();

    const view = service.toSessionView(activeSession);

    expect(view).toEqual({
      user: { id: 'kc-user-1', displayName: 'Hub Admin', email: null, roles: ['User'] },
      organization: { id: 'org-1', name: 'Axora' },
      permissions: ['hub.catalog.read'],
      csrfToken: 'csrf',
      accountSecurityUrl: `${ISSUER_URL}/account/account-security/signing-in`,
    });
  });
});
