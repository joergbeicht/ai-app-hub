import { IsString } from 'class-validator';

/** Name/Beschreibung je unterstützter Sprache - siehe `HUB_APP_LOCALES`. */
export class LocalizedTextDto {
  @IsString()
  de!: string;

  @IsString()
  en!: string;

  @IsString()
  es!: string;

  @IsString()
  fr!: string;

  @IsString()
  tr!: string;

  @IsString()
  it!: string;
}
