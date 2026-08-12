import { Matches } from 'class-validator';
import { BADGE_CODE_PATTERN } from '../../badge-login/badge-login.constants';
import { PIN_PATTERN } from '../tablet-auth.constants';

export class TabletLoginDto {
  @Matches(BADGE_CODE_PATTERN)
  badgeCode!: string;

  @Matches(PIN_PATTERN)
  pin!: string;
}
