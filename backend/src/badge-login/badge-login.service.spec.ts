import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BadgeLoginService } from './badge-login.service';
import type { GraphService } from '../graph/graph.service';

describe('BadgeLoginService', () => {
  function createService(user: { userPrincipalName: string } | null) {
    const graphService = {
      findUserByEmployeeId: jest.fn().mockResolvedValue(user),
    } as unknown as jest.Mocked<GraphService>;
    return { service: new BadgeLoginService(graphService), graphService };
  }

  it('returns the user principal name for a known badge code', async () => {
    const { service, graphService } = createService({ userPrincipalName: 'lisa@axora.local' });

    const result = await service.lookupByBadgeCode('EMP-12345');

    expect(graphService.findUserByEmployeeId).toHaveBeenCalledWith('EMP-12345');
    expect(result).toEqual({ userPrincipalName: 'lisa@axora.local' });
  });

  it('throws NotFoundException when no user is linked to the badge code', async () => {
    const { service } = createService(null);

    await expect(service.lookupByBadgeCode('EMP-99999')).rejects.toThrow(NotFoundException);
  });

  it('rejects badge codes with an invalid format before calling Microsoft Graph', async () => {
    const { service, graphService } = createService(null);

    await expect(service.lookupByBadgeCode("'; DROP TABLE users; --")).rejects.toThrow(
      BadRequestException,
    );
    expect(graphService.findUserByEmployeeId).not.toHaveBeenCalled();
  });

  it('rejects an empty badge code', async () => {
    const { service } = createService(null);

    await expect(service.lookupByBadgeCode('')).rejects.toThrow(BadRequestException);
  });
});
