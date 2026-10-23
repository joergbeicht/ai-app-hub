import { Type } from 'class-transformer';
import { ArrayMaxSize, ValidateNested } from 'class-validator';
import { HubAppContentDto } from './hub-app.dto';

/** Body von `PUT /hub-apps` - ersetzt den gesamten Katalog (Reihenfolge = Array-Reihenfolge). */
export class ReplaceHubAppsDto {
  @ValidateNested({ each: true })
  @Type(() => HubAppContentDto)
  // Großzügige Obergrenze nur als Schutz gegen versehentlich riesige Payloads, keine fachliche
  // Beschränkung (siehe class-validator/DTO-Konvention in nestjs.mdc).
  @ArrayMaxSize(500)
  apps!: HubAppContentDto[];
}
