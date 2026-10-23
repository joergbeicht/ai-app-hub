import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { LocalizedTextDto } from './localized-text.dto';

/** Response-Shape für `GET /hub-apps` - entspricht `AppEntry` im Frontend (ohne `enabled`,
 * das bleibt eine rein persönliche, lokale Präferenz - siehe ADR-17). */
export class HubAppDto {
  id!: string;
  name!: LocalizedTextDto;
  description!: LocalizedTextDto;
  url!: string;
  iconType!: 'mat-icon' | 'image';
  icon!: string;
  sortOrder!: number;
}

/** Ein Eintrag im `PUT /hub-apps`-Body - identisch zu `HubAppDto`, aber als Input validiert. */
export class HubAppContentDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ValidateNested()
  @Type(() => LocalizedTextDto)
  name!: LocalizedTextDto;

  @ValidateNested()
  @Type(() => LocalizedTextDto)
  description!: LocalizedTextDto;

  @IsString()
  @IsNotEmpty()
  url!: string;

  @IsIn(['mat-icon', 'image'])
  iconType!: 'mat-icon' | 'image';

  @IsString()
  icon!: string;
}
