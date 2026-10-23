import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { HubAuthGuard } from '../auth/hub-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UsersService } from './users.service';
import { UserDto } from './dto/user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';

/**
 * Nur für `Administrator` - Rollenverwaltung ohne Azure-Portal (siehe ADR-6 in
 * `docs/ARCHITEKTUR-ENTSCHEIDUNGEN.md`). `HubAuthGuard` prüft die Anmeldung,
 * `RolesGuard` danach die Rollen. Verwaltet Entra-App-Rollen über Graph und ist damit Bestand.
 */
@Controller('users')
@UseGuards(HubAuthGuard, RolesGuard)
@Roles('Administrator')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(): Promise<UserDto[]> {
    return this.usersService.findAll();
  }

  @Patch(':id/role')
  updateRole(@Param('id') id: string, @Body() dto: UpdateUserRoleDto): Promise<UserDto> {
    return this.usersService.updateRole(id, dto.role);
  }
}
