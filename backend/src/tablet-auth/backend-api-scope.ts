/**
 * Muss mit `backendApiScope()` im Frontend (`frontend/src/app/core/auth/msal-config.ts`)
 * übereinstimmen - der ROPC-Austausch (siehe `RopcTokenService`) fordert dieselbe Berechtigung an
 * wie ein normaler interaktiver PC-Login, damit das Access Token für spätere Backend-Aufrufe
 * dieselbe Audience/Claims trägt (siehe `AzureJwtGuard`).
 */
export function backendApiScopeUri(azureClientId: string): string {
  return `api://${azureClientId}/access_as_user`;
}
