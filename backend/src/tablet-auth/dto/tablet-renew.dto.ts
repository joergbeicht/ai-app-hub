import { IsString, MinLength } from 'class-validator';

export class TabletRenewDto {
  @IsString()
  @MinLength(1)
  deviceToken!: string;
}
