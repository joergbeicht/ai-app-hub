import { randomBytes } from 'node:crypto';
import type { PrismaService } from '../../prisma/prisma.service';
import type { HubAccess } from '../../iam/hub-access';
import { AuthSessionService, type SessionIdentity, type SessionTokens } from './auth-session.service';
import {
  LOGIN_TRANSACTION_LIFETIME_MS,
  SESSION_ABSOLUTE_LIFETIME_MS,
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_TOUCH_INTERVAL_MS,
} from './bff.constants';
import { hashToken } from './secure-token';
import { TokenCipher } from './token-cipher';

const NOW = new Date('2026-10-23T12:00:00Z');
const cipher = new TokenCipher(randomBytes(32));

const identity: SessionIdentity = {
  subject: 'kc-user-1',
  displayName: 'Hub Administrator',
  email: 'admin@axora.local',
  idToken: 'id-token',
};
const tokens: SessionTokens = {
  accessToken: 'access-token',
  accessTokenExpiresAt: new Date(NOW.getTime() + 300_000),
  refreshToken: 'refresh-token',
};
const access: HubAccess = {
  organizationId: 'org-1',
  organizationName: 'Axora',
  permissions: ['hub.catalog.manage', 'hub.catalog.read'],
  roles: ['Administrator'],
};

function sessionRow(overrides: Partial<{ expiresAt: Date; lastSeenAt: Date }> = {}) {
  return {
    id: hashToken('session-handle'),
    subject: identity.subject,
    displayName: identity.displayName,
    email: identity.email,
    roles: access.roles,
    permissions: access.permissions,
    organizationId: access.organizationId,
    organizationName: access.organizationName,
    accessCheckedAt: NOW,
    idToken: identity.idToken,
    accessToken: cipher.encrypt(tokens.accessToken),
    accessTokenExpiresAt: tokens.accessTokenExpiresAt,
    refreshToken: cipher.encrypt(tokens.refreshToken),
    csrfToken: 'csrf',
    expiresAt: new Date(NOW.getTime() + SESSION_ABSOLUTE_LIFETIME_MS),
    lastSeenAt: NOW,
    createdAt: NOW,
    ...overrides,
  };
}

function createService() {
  const prisma = {
    authSession: {
      create: jest.fn().mockResolvedValue(undefined),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue(sessionRow()),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    authLoginTransaction: {
      create: jest.fn().mockResolvedValue(undefined),
      findUnique: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const service = new AuthSessionService(prisma as unknown as PrismaService, cipher);
  return { service, prisma };
}

describe('AuthSessionService', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('login transactions', () => {
    it('stores only the hash of the cookie handle', async () => {
      const { service, prisma } = createService();

      const transaction = await service.startLoginTransaction('/settings');

      const stored = prisma.authLoginTransaction.create.mock.calls[0][0].data;
      expect(stored.id).toBe(hashToken(transaction.handle));
      expect(stored.id).not.toBe(transaction.handle);
      expect(stored.expiresAt).toEqual(new Date(NOW.getTime() + LOGIN_TRANSACTION_LIFETIME_MS));
      expect(new Set([transaction.state, transaction.nonce, transaction.codeVerifier]).size).toBe(3);
    });

    it('can be consumed exactly once', async () => {
      const { service, prisma } = createService();
      prisma.authLoginTransaction.findUnique.mockResolvedValue({
        state: 's',
        nonce: 'n',
        codeVerifier: 'v',
        returnTo: '/',
        expiresAt: new Date(NOW.getTime() + 1000),
      });
      prisma.authLoginTransaction.deleteMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

      await expect(service.consumeLoginTransaction('tx')).resolves.toEqual({
        state: 's',
        nonce: 'n',
        codeVerifier: 'v',
        returnTo: '/',
      });
      await expect(service.consumeLoginTransaction('tx')).resolves.toBeNull();
    });

    it('rejects expired or missing transactions', async () => {
      const { service, prisma } = createService();
      prisma.authLoginTransaction.findUnique.mockResolvedValue({
        state: 's',
        nonce: 'n',
        codeVerifier: 'v',
        returnTo: '/',
        expiresAt: NOW,
      });

      await expect(service.consumeLoginTransaction('tx')).resolves.toBeNull();
      await expect(service.consumeLoginTransaction(undefined)).resolves.toBeNull();
    });
  });

  describe('sessions', () => {
    it('creates a session with absolute lifetime, a hashed id and the IAM access', async () => {
      const { service, prisma } = createService();

      const created = await service.createSession(identity, tokens, access);

      const stored = prisma.authSession.create.mock.calls[0][0].data;
      expect(stored.id).toBe(hashToken(created.handle));
      expect(created.expiresAt).toEqual(new Date(NOW.getTime() + SESSION_ABSOLUTE_LIFETIME_MS));
      expect(stored.csrfToken).toEqual(expect.any(String));
      expect(stored).toMatchObject({ ...access, accessCheckedAt: NOW });
    });

    it('stores tokens only encrypted', async () => {
      const { service, prisma } = createService();

      await service.createSession(identity, tokens, access);

      const stored = prisma.authSession.create.mock.calls[0][0].data;
      expect(stored.accessToken).not.toContain('access-token');
      expect(stored.refreshToken).not.toContain('refresh-token');
      expect(cipher.decrypt(stored.accessToken)).toBe('access-token');
      expect(cipher.decrypt(stored.refreshToken)).toBe('refresh-token');
    });

    it('returns an active session with decrypted tokens and without the ID token', async () => {
      const { service, prisma } = createService();
      prisma.authSession.findUnique.mockResolvedValue(sessionRow());

      const session = await service.findActiveSession('session-handle');

      expect(prisma.authSession.findUnique).toHaveBeenCalledWith({
        where: { id: hashToken('session-handle') },
      });
      expect(session).toEqual({
        id: hashToken('session-handle'),
        subject: identity.subject,
        displayName: identity.displayName,
        email: identity.email,
        csrfToken: 'csrf',
        ...access,
        accessCheckedAt: NOW,
        accessToken: 'access-token',
        accessTokenExpiresAt: tokens.accessTokenExpiresAt,
        refreshToken: 'refresh-token',
      });
      expect(prisma.authSession.update).not.toHaveBeenCalled();
    });

    it('refreshes lastSeenAt at most once per touch interval', async () => {
      const { service, prisma } = createService();
      const lastSeenAt = new Date(NOW.getTime() - SESSION_TOUCH_INTERVAL_MS);
      prisma.authSession.findUnique.mockResolvedValue(sessionRow({ lastSeenAt }));

      await service.findActiveSession('session-handle');

      expect(prisma.authSession.update).toHaveBeenCalledWith({
        where: { id: hashToken('session-handle') },
        data: { lastSeenAt: NOW },
      });
    });

    it.each([
      ['after the absolute lifetime', { expiresAt: NOW }],
      ['after the idle timeout', { lastSeenAt: new Date(NOW.getTime() - SESSION_IDLE_TIMEOUT_MS) }],
    ])('deletes and rejects a session %s', async (_label, overrides) => {
      const { service, prisma } = createService();
      prisma.authSession.findUnique.mockResolvedValue(sessionRow(overrides));

      await expect(service.findActiveSession('session-handle')).resolves.toBeNull();
      expect(prisma.authSession.deleteMany).toHaveBeenCalledWith({
        where: { id: hashToken('session-handle') },
      });
    });

    it('replaces the logout hint when the refresh brings a new ID token', async () => {
      const { service, prisma } = createService();
      prisma.authSession.findUnique.mockResolvedValue(sessionRow());
      const session = await service.findActiveSession('session-handle');

      await service.storeTokens(session!, { ...tokens, accessToken: 'new-access', idToken: 'new-id' });

      const data = prisma.authSession.update.mock.calls[0][0].data;
      expect(cipher.decrypt(data.accessToken)).toBe('new-access');
      expect(data.idToken).toBe('new-id');
    });

    it('returns the ID token when ending a session for the Keycloak logout', async () => {
      const { service, prisma } = createService();
      prisma.authSession.findUnique.mockResolvedValue(sessionRow());

      await expect(service.endSession('session-handle')).resolves.toBe('id-token');
      expect(prisma.authSession.deleteMany).toHaveBeenCalled();
    });

    it('ends nothing without a session cookie', async () => {
      const { service, prisma } = createService();

      await expect(service.endSession(undefined)).resolves.toBeNull();
      expect(prisma.authSession.findUnique).not.toHaveBeenCalled();
    });
  });
});
