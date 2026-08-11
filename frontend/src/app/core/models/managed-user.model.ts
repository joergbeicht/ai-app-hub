/** Muss exakt den drei App Roles der Azure-AD-App-Registrierung entsprechen (siehe ADR-6). */
export const ASSIGNABLE_APP_ROLES = ['User', 'Administrator'] as const;
export type AssignableAppRole = (typeof ASSIGNABLE_APP_ROLES)[number];

export const MANAGED_APP_ROLES = [...ASSIGNABLE_APP_ROLES, 'Guest'] as const;
export type ManagedAppRole = (typeof MANAGED_APP_ROLES)[number];

/** Antwortform des `app-hub-backend` (`GET /users`, `PATCH /users/:id/role`), siehe ADR-6. */
export interface ManagedUser {
  id: string;
  displayName: string;
  email: string | null;
  role: ManagedAppRole;
}
