import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import type { GraphService } from '../graph/graph.service';

describe('UsersService', () => {
  const users = [
    { id: 'user-1', displayName: 'Sam Nutzer', mail: 'sam@axora.local', userPrincipalName: 'sam' },
    { id: 'user-2', displayName: 'Alex Admin', mail: null, userPrincipalName: 'alex@axora.local' },
  ];
  const appRoles = [
    { id: 'role-user', value: 'User' },
    { id: 'role-admin', value: 'Administrator' },
  ];

  function createService(assignments: { id: string; principalId: string; appRoleId: string }[]) {
    const graphService = {
      listUsers: jest.fn().mockResolvedValue(users),
      listAppRoleAssignments: jest.fn().mockResolvedValue(assignments),
      getAppRoles: jest.fn().mockResolvedValue(appRoles),
      assignRole: jest.fn().mockResolvedValue(undefined),
      removeRoleAssignment: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<GraphService>;
    return { service: new UsersService(graphService), graphService };
  }

  it('maps assigned app roles onto users and falls back to Guest', async () => {
    const { service } = createService([
      { id: 'assignment-1', principalId: 'user-2', appRoleId: 'role-admin' },
    ]);

    const result = await service.findAll();

    expect(result).toEqual([
      { id: 'user-1', displayName: 'Sam Nutzer', email: 'sam@axora.local', role: 'Guest' },
      { id: 'user-2', displayName: 'Alex Admin', email: 'alex@axora.local', role: 'Administrator' },
    ]);
  });

  it('removes the existing assignment and creates a new one when changing role', async () => {
    const { service, graphService } = createService([
      { id: 'assignment-1', principalId: 'user-1', appRoleId: 'role-user' },
    ]);

    const result = await service.updateRole('user-1', 'Administrator');

    expect(graphService.removeRoleAssignment).toHaveBeenCalledWith('assignment-1');
    expect(graphService.assignRole).toHaveBeenCalledWith('user-1', 'role-admin');
    expect(result.role).toBe('Administrator');
  });

  it('only removes assignments (no new one) when setting role back to Guest', async () => {
    const { service, graphService } = createService([
      { id: 'assignment-1', principalId: 'user-1', appRoleId: 'role-user' },
    ]);

    const result = await service.updateRole('user-1', 'Guest');

    expect(graphService.removeRoleAssignment).toHaveBeenCalledWith('assignment-1');
    expect(graphService.assignRole).not.toHaveBeenCalled();
    expect(result.role).toBe('Guest');
  });

  it('throws NotFoundException for an unknown user id', async () => {
    const { service } = createService([]);

    await expect(service.updateRole('unknown', 'User')).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when the target app role is missing on the service principal', async () => {
    const graphService = {
      listUsers: jest.fn().mockResolvedValue(users),
      listAppRoleAssignments: jest.fn().mockResolvedValue([]),
      getAppRoles: jest.fn().mockResolvedValue([]),
      assignRole: jest.fn(),
      removeRoleAssignment: jest.fn(),
    } as unknown as jest.Mocked<GraphService>;
    const service = new UsersService(graphService);

    await expect(service.updateRole('user-1', 'Administrator')).rejects.toThrow(
      BadRequestException,
    );
  });
});
