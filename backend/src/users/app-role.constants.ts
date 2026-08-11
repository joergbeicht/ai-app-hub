/**
 * Muss exakt den drei App Roles der Azure-AD-App-Registrierung entsprechen (Wert im `roles`-Claim),
 * siehe Frontend-Pendant `frontend/src/app/core/models/user.model.ts` (`resolvePrimaryRole`).
 * "Guest" ist kein zuweisbarer Zielwert hier - er ist der Fallback für "keine Rolle zugewiesen"
 * (Azure kennt keinen "Assign to Guest"-Zustand, nur "keine Zuweisung").
 */
export const ASSIGNABLE_APP_ROLE_VALUES = ['User', 'Administrator'] as const;
export type AssignableAppRoleValue = (typeof ASSIGNABLE_APP_ROLE_VALUES)[number];

export const APP_ROLE_VALUES = [...ASSIGNABLE_APP_ROLE_VALUES, 'Guest'] as const;
export type AppRoleValue = (typeof APP_ROLE_VALUES)[number];

export const GUEST_FALLBACK_ROLE: AppRoleValue = 'Guest';
