import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/** Markiert einen Controller/Endpoint als nur für die angegebenen App-Roles zugänglich (siehe `RolesGuard`). */
export const Roles = (...roles: string[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(ROLES_KEY, roles);
