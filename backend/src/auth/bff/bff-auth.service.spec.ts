import type { IncomingMessage } from 'node:http';
import type { AuthSessionService, SessionIdentity } from './auth-session.service';
import type { BffConfig } from './bff-config';
import { BffAuthService, LoginFlowError } from './bff-auth.service';
import type { OidcClientService } from './oidc-client.service';

const FRONTEND_URL = 'https://localhost:6054';
const callbackRequest = {} as IncomingMessage;
const transaction = { state: 's', nonce: 'n', codeVerifier: 'v', returnTo: '/settings' };

function identityWith(roles: string[]): SessionIdentity {
  return { subject: 'kc-user-1', displayName: 'Hub Admin', email: null, roles, idToken: 'id-token' };
}

function createService() {
  const oidc = {
    authorizationUrl: jest.fn().mockResolvedValue('https://kc/auth?x=1'),
    exchangeCode: jest.fn(),
    endSessionUrl: jest.fn().mockResolvedValue('https://kc/logout'),
  };
  const sessions = {
    startLoginTransaction: jest.fn(async (returnTo: string) => ({ ...transaction, returnTo, handle: 'tx-handle' })),
    consumeLoginTransaction: jest.fn().mockResolvedValue(transaction),
    createSession: jest.fn().mockResolvedValue({ handle: 'session-handle', expiresAt: new Date(0) }),
    endSession: jest.fn().mockResolvedValue('id-token'),
  };
  const config = { frontendUrl: FRONTEND_URL } as BffConfig;
  const service = new BffAuthService(
    oidc as unknown as OidcClientService,
    sessions as unknown as AuthSessionService,
    config,
  );
  return { service, oidc, sessions };
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

  it('creates a session and returns to the requested page for entitled users', async () => {
    const { service, oidc, sessions } = createService();
    oidc.exchangeCode.mockResolvedValue(identityWith(['User']));

    const completed = await service.completeLogin('tx-handle', callbackRequest);

    expect(oidc.exchangeCode).toHaveBeenCalledWith(callbackRequest, transaction);
    expect(sessions.createSession).toHaveBeenCalledWith(identityWith(['User']));
    expect(completed.redirectUrl).toBe(`${FRONTEND_URL}/settings`);
    expect(completed.sessionHandle).toBe('session-handle');
  });

  it('reports an expired login when the transaction is gone', async () => {
    const { service, sessions, oidc } = createService();
    sessions.consumeLoginTransaction.mockResolvedValue(null);

    await expectLoginError(service.completeLogin(undefined, callbackRequest), 'session_expired');
    expect(oidc.exchangeCode).not.toHaveBeenCalled();
  });

  it('denies users without a hub role (default deny)', async () => {
    const { service, oidc, sessions } = createService();
    oidc.exchangeCode.mockResolvedValue(identityWith(['offline_access']));

    await expectLoginError(service.completeLogin('tx-handle', callbackRequest), 'not_entitled');
    expect(sessions.createSession).not.toHaveBeenCalled();
  });

  it('ends the session and returns the Keycloak logout URL', async () => {
    const { service, oidc } = createService();

    await expect(service.logout('session-handle')).resolves.toBe('https://kc/logout');
    expect(oidc.endSessionUrl).toHaveBeenCalledWith('id-token');
  });
});
