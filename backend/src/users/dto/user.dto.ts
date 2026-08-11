import type { AppRoleValue } from '../app-role.constants';

export class UserDto {
  id!: string;
  displayName!: string;
  email!: string | null;
  role!: AppRoleValue;
}
