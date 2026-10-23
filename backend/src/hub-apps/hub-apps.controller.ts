import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { HubAuthGuard } from '../auth/hub-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { HubAppsService } from './hub-apps.service';
import { HubAppDto } from './dto/hub-app.dto';
import { ReplaceHubAppsDto } from './dto/replace-hub-apps.dto';

/**
 * Der zentrale App-Katalog (siehe ADR-17): jeder eingeloggte Benutzer darf ihn lesen, nur
 * `Administrator` darf ihn ändern (`HubAuthGuard` prüft die Anmeldung, `RolesGuard` danach die
 * Rollen - gleiches Muster wie `UsersController`, siehe ADR-6/ADR-19).
 */
@Controller('hub-apps')
@UseGuards(HubAuthGuard)
export class HubAppsController {
  constructor(private readonly hubAppsService: HubAppsService) {}

  @Get()
  findAll(): Promise<HubAppDto[]> {
    return this.hubAppsService.findAll();
  }

  @Put()
  @UseGuards(RolesGuard)
  @Roles('Administrator')
  replaceAll(@Body() dto: ReplaceHubAppsDto): Promise<HubAppDto[]> {
    return this.hubAppsService.replaceAll(dto.apps);
  }
}
