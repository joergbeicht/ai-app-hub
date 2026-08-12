import { ConfigService } from '@nestjs/config';
import {
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { TabletAuthService } from './tablet-auth.service';
import type { GraphService, GraphUser } from '../graph/graph.service';
import type { KeyVaultService } from './key-vault.service';
import type { RopcTokenService } from './ropc-token.service';
import type { TabletSessionTokenService } from './tablet-session-token.service';
import type { TabletCredential } from './tablet-credential.model';

const TABLET_USER: GraphUser = {
  id: 'user-1',
  displayName: 'Tablet User',
  mail: null,
  userPrincipalName: 'tablet-user@contoso.com',
};

const GROUP_ID = 'group-1';

describe('TabletAuthService', () => {
  async function buildCredential(
    overrides: Partial<TabletCredential> = {},
  ): Promise<TabletCredential> {
    return {
      userPrincipalName: TABLET_USER.userPrincipalName,
      entraPassword: 'super-secret-password',
      pinHash: await bcrypt.hash('1234', 4),
      failedAttempts: 0,
      lockedUntil: null,
      ...overrides,
    };
  }

  function createService(options: {
    user?: GraphUser | null;
    isMember?: boolean;
    credential?: TabletCredential | null;
    groupId?: string | null;
  }) {
    const graphService = {
      findUserByEmployeeId: jest.fn().mockResolvedValue(options.user ?? TABLET_USER),
      isMemberOfGroup: jest.fn().mockResolvedValue(options.isMember ?? true),
    } as unknown as jest.Mocked<GraphService>;

    const keyVaultService = {
      getCredential: jest.fn().mockResolvedValue(options.credential ?? null),
      saveCredential: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<KeyVaultService>;

    const ropcTokenService = {
      signInWithPassword: jest.fn().mockResolvedValue({ roles: ['User'] }),
    } as unknown as jest.Mocked<RopcTokenService>;

    const tokenService = {
      issueSessionToken: jest.fn().mockReturnValue('session-token'),
      issueDeviceToken: jest.fn().mockReturnValue('device-token'),
      verifyDeviceToken: jest.fn(),
    } as unknown as jest.Mocked<TabletSessionTokenService>;

    // `options.groupId === null` steht bewusst für "nicht konfiguriert" (anders als `undefined`,
    // das im Test-Objekt "kein Override, Standardwert verwenden" bedeutet - `??` würde beides
    // gleich behandeln und den "nicht konfiguriert"-Testfall unbeabsichtigt verdecken).
    const configService = {
      get: jest
        .fn()
        .mockReturnValue(options.groupId === null ? undefined : (options.groupId ?? GROUP_ID)),
    } as unknown as jest.Mocked<ConfigService>;

    return {
      service: new TabletAuthService(
        graphService,
        keyVaultService,
        ropcTokenService,
        tokenService,
        configService,
      ),
      graphService,
      keyVaultService,
      ropcTokenService,
      tokenService,
    };
  }

  it('logs in with a correct PIN and returns session + device tokens', async () => {
    const credential = await buildCredential();
    const { service, ropcTokenService, tokenService } = createService({ credential });

    const result = await service.loginWithPin('TABLET-001', '1234');

    expect(ropcTokenService.signInWithPassword).toHaveBeenCalledWith(
      TABLET_USER.userPrincipalName,
      credential.entraPassword,
    );
    expect(tokenService.issueSessionToken).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({ sessionToken: 'session-token', deviceToken: 'device-token' }),
    );
  });

  it('rejects an incorrect PIN and increments the failed-attempt counter', async () => {
    const credential = await buildCredential();
    const { service, keyVaultService } = createService({ credential });

    await expect(service.loginWithPin('TABLET-001', '0000')).rejects.toThrow(UnauthorizedException);

    expect(keyVaultService.saveCredential).toHaveBeenCalledWith(
      'TABLET-001',
      expect.objectContaining({ failedAttempts: 1 }),
    );
  });

  it('locks the account after the maximum number of failed attempts', async () => {
    const credential = await buildCredential({ failedAttempts: 4 });
    const { service, keyVaultService } = createService({ credential });

    await expect(service.loginWithPin('TABLET-001', '0000')).rejects.toThrow(UnauthorizedException);

    const savedCredential = keyVaultService.saveCredential.mock.calls[0][1] as TabletCredential;
    expect(savedCredential.failedAttempts).toBe(5);
    expect(savedCredential.lockedUntil).not.toBeNull();
  });

  it('rejects a login while the account is locked, without checking the PIN again', async () => {
    const credential = await buildCredential({
      failedAttempts: 5,
      lockedUntil: new Date(Date.now() + 60_000).toISOString(),
    });
    const { service, ropcTokenService } = createService({ credential });

    await expect(service.loginWithPin('TABLET-001', '1234')).rejects.toThrow(ForbiddenException);
    expect(ropcTokenService.signInWithPassword).not.toHaveBeenCalled();
  });

  it('rejects users who are not a member of the tablet-users group', async () => {
    const { service } = createService({ isMember: false, credential: await buildCredential() });

    await expect(service.loginWithPin('TABLET-001', '1234')).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException when the badge code is unknown', async () => {
    const { service } = createService({ user: null });

    await expect(service.loginWithPin('UNKNOWN', '1234')).rejects.toThrow(NotFoundException);
  });

  it('throws ServiceUnavailableException when the tablet-users group is not configured', async () => {
    const { service } = createService({ groupId: null });

    await expect(service.loginWithPin('TABLET-001', '1234')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('renews a session using a valid device token without requiring a PIN', async () => {
    const credential = await buildCredential();
    const { service, tokenService } = createService({ credential });
    tokenService.verifyDeviceToken.mockReturnValue({
      sub: TABLET_USER.id,
      badgeCode: 'TABLET-001',
      displayName: TABLET_USER.displayName,
      upn: TABLET_USER.userPrincipalName,
      roles: [],
      tokenUse: 'tablet-device',
    });

    const result = await service.renewWithDeviceToken('a-valid-device-token');

    expect(result.sessionToken).toBe('session-token');
    expect(result.deviceToken).toBe('device-token');
  });
});
