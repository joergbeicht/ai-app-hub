import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { BadgeLoginService } from './badge-login.service';
import { BadgeLookupResultDto } from './dto/badge-lookup-result.dto';

/**
 * Bewusst OHNE `AzureJwtGuard`/`RolesGuard` (siehe `UsersController`) - dieser Endpunkt wird
 * gerade VOR dem eigentlichen Login aufgerufen (siehe ADR-7, "Weg A"), es gibt an dieser Stelle
 * noch kein Access Token. Gibt nur einen Benutzernamen-Hinweis zurück, kein Geheimnis - trotzdem
 * per `ThrottlerGuard` gegen Enumeration/Missbrauch abgesichert (siehe `BadgeLoginModule`).
 */
@Controller('badge-login')
@UseGuards(ThrottlerGuard)
export class BadgeLoginController {
  constructor(private readonly badgeLoginService: BadgeLoginService) {}

  @Get(':badgeCode')
  lookup(@Param('badgeCode') badgeCode: string): Promise<BadgeLookupResultDto> {
    return this.badgeLoginService.lookupByBadgeCode(badgeCode);
  }
}
