import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { GraphService } from '../graph/graph.service';
import { UserDto } from './dto/user.dto';
import {
  ASSIGNABLE_APP_ROLE_VALUES,
  GUEST_FALLBACK_ROLE,
  type AppRoleValue,
} from './app-role.constants';

@Injectable()
export class UsersService {
  constructor(private readonly graphService: GraphService) {}

  async findAll(): Promise<UserDto[]> {
    const [users, assignments, appRoles] = await Promise.all([
      this.graphService.listUsers(),
      this.graphService.listAppRoleAssignments(),
      this.graphService.getAppRoles(),
    ]);

    const roleValueByAppRoleId = new Map(appRoles.map((role) => [role.id, role.value]));
    const roleByUserId = new Map<string, AppRoleValue>();
    for (const assignment of assignments) {
      const roleValue = roleValueByAppRoleId.get(assignment.appRoleId);
      if (roleValue) {
        roleByUserId.set(assignment.principalId, roleValue as AppRoleValue);
      }
    }

    return users.map((user) => ({
      id: user.id,
      displayName: user.displayName,
      email: user.mail ?? user.userPrincipalName,
      role: roleByUserId.get(user.id) ?? GUEST_FALLBACK_ROLE,
    }));
  }

  async updateRole(userId: string, targetRole: AppRoleValue): Promise<UserDto> {
    const [users, assignments, appRoles] = await Promise.all([
      this.graphService.listUsers(),
      this.graphService.listAppRoleAssignments(),
      this.graphService.getAppRoles(),
    ]);

    const user = users.find((candidate) => candidate.id === userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    // Bestehende Zuweisung(en) für diesen Nutzer auf dieser App entfernen - Graph kennt kein
    // "Update", nur "Assignment löschen" + "Assignment neu anlegen".
    const existingAssignments = assignments.filter(
      (assignment) => assignment.principalId === userId,
    );
    await Promise.all(
      existingAssignments.map((assignment) => this.graphService.removeRoleAssignment(assignment.id)),
    );

    if (targetRole === GUEST_FALLBACK_ROLE) {
      return { id: user.id, displayName: user.displayName, email: user.mail, role: targetRole };
    }

    const targetAppRole = appRoles.find((role) => role.value === targetRole);
    if (!targetAppRole) {
      throw new BadRequestException(
        `App role "${targetRole}" not found on the service principal - expected one of: ${ASSIGNABLE_APP_ROLE_VALUES.join(', ')}`,
      );
    }
    await this.graphService.assignRole(userId, targetAppRole.id);

    return { id: user.id, displayName: user.displayName, email: user.mail, role: targetRole };
  }
}
