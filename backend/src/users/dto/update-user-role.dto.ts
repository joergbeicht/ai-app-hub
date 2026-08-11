import { IsIn } from 'class-validator';
import { APP_ROLE_VALUES, type AppRoleValue } from '../app-role.constants';

export class UpdateUserRoleDto {
  @IsIn(APP_ROLE_VALUES)
  role!: AppRoleValue;
}
