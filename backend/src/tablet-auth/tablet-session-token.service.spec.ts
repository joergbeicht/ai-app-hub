import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { TabletSessionTokenService } from './tablet-session-token.service';

const CLAIMS = {
  sub: 'user-1',
  badgeCode: 'TABLET-001',
  displayName: 'Tablet User',
  upn: 'tablet-user@contoso.com',
  roles: ['User'],
};

describe('TabletSessionTokenService', () => {
  function createService(secret: string | null = 'test-secret'): TabletSessionTokenService {
    const configService = {
      get: jest.fn().mockReturnValue(secret === null ? undefined : secret),
    } as unknown as ConfigService;
    return new TabletSessionTokenService(configService);
  }

  it('issues a device token that can be verified again', () => {
    const service = createService();
    const token = service.issueDeviceToken(CLAIMS);

    const decoded = service.verifyDeviceToken(token);

    expect(decoded).toEqual(expect.objectContaining({ ...CLAIMS, tokenUse: 'tablet-device' }));
  });

  it('rejects a session token when verified as a device token', () => {
    const service = createService();
    const sessionToken = service.issueSessionToken(CLAIMS);

    expect(() => service.verifyDeviceToken(sessionToken)).toThrow(UnauthorizedException);
  });

  it('rejects a tampered device token', () => {
    const service = createService();
    const token = service.issueDeviceToken(CLAIMS);

    expect(() => service.verifyDeviceToken(`${token}tampered`)).toThrow(UnauthorizedException);
  });

  it('fails fast when no signing secret is configured', () => {
    const service = createService(null);

    expect(() => service.issueSessionToken(CLAIMS)).toThrow(ServiceUnavailableException);
  });
});
