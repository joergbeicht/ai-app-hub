import type { Signal } from '@angular/core';
import type { UrlTree } from '@angular/router';
import type { HubUser } from '../models/user.model';

/**
 * Fassade über den Anmeldeweg (ADR-19), damit `authGuard`, Header, Login- und Settings-Seite
 * nicht wissen müssen, ob MSAL (`MsalAuthService`, Bestand) oder das Keycloak-BFF
 * (`BffAuthService`) dahintersteht. Welche Implementierung gilt, entscheidet `createAppConfig`
 * anhand von `RuntimeConfig.authMode`.
 */
export abstract class AuthService {
  abstract readonly currentUser: Signal<HubUser | null>;
  abstract readonly isLoggedIn: Signal<boolean>;

  abstract login(): void;
  abstract logout(): void;

  /**
   * Was `authGuard` ohne Anmeldung tut: eine Login-Seite der App (`UrlTree`) oder direkt der
   * Seitenwechsel zum Identity Provider (`false`, die Navigation in der App bricht ab).
   */
  abstract redirectToLogin(returnTo: string): UrlTree | false;
}
