/** Hub user, derived from the Azure Entra ID account/ID-token claims (MSAL). */
export interface HubUser {
  id: string;
  displayName: string;
  /** Primary app role, see `resolvePrimaryRole` – may be a placeholder until Azure role assignment is done. */
  role: string;
  email: string;
}

const ROLE_PRIORITY = ['Administrator', 'User', 'Guest'] as const;

/**
 * Picks one display role from the ID-token's `roles` claim (App Roles `User`/`Administrator`/
 * `Guest`, see ADR-2). A user can technically hold multiple roles; we show the most privileged one.
 *
 * Falls back to `'Guest'` when the claim is empty – this happens for every user until the Azure
 * team assigns App Roles under Entra ID → Enterprise-Anwendungen → ai-app-hub → Benutzer und
 * Gruppen. Not currently used for route/feature gating, only for display in the header.
 */
export function resolvePrimaryRole(roles: readonly string[] | undefined): string {
  if (!roles || roles.length === 0) {
    return 'Guest';
  }
  return ROLE_PRIORITY.find((role) => roles.includes(role)) ?? roles[0];
}
