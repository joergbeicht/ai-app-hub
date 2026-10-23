import type { Request } from 'express';

/**
 * Die angemeldete Person, unabhängig davon, ob sie per Entra-Token oder Keycloak-Sitzung
 * kam. `RolesGuard` und Controller arbeiten nur mit diesem Modell.
 */
export interface HubPrincipal {
  sub: string;
  name?: string;
  email?: string;
  roles: string[];
}

/** Express Request nach erfolgreicher Prüfung durch `HubAuthGuard`. */
export interface AuthenticatedRequest extends Request {
  user: HubPrincipal;
}
