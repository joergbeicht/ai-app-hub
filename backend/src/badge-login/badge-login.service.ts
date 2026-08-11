import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { GraphService } from '../graph/graph.service';
import { BadgeLookupResultDto } from './dto/badge-lookup-result.dto';
import { BADGE_CODE_PATTERN } from './badge-login.constants';

/**
 * Löst einen gescannten Mitarbeiterausweis-Barcode in einen Benutzernamen auf, siehe ADR-7
 * ("Weg A"): der Barcode identifiziert nur, WER sich anmelden will (wie ein Nutzername), er ist
 * NICHT das Login-Geheimnis - authentifiziert wird ausschließlich über das normale, feste
 * Entra-Passwort im anschließenden `loginRedirect`. Absichtlich ohne `AzureJwtGuard`/`RolesGuard`
 * (siehe `BadgeLoginController`) - der Aufruf passiert ja gerade VOR dem Login.
 */
@Injectable()
export class BadgeLoginService {
  constructor(private readonly graphService: GraphService) {}

  async lookupByBadgeCode(badgeCode: string): Promise<BadgeLookupResultDto> {
    if (!BADGE_CODE_PATTERN.test(badgeCode)) {
      throw new BadRequestException('Invalid badge code format');
    }

    const user = await this.graphService.findUserByEmployeeId(badgeCode);
    if (!user) {
      throw new NotFoundException('No user is linked to this badge code');
    }

    return { userPrincipalName: user.userPrincipalName };
  }
}
