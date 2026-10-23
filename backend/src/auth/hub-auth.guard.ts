import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Observable } from 'rxjs';

/** Der für den aktiven `AUTH_MODE` zuständige Guard (siehe `AuthModule.forRoot`). */
export const REQUEST_AUTHENTICATOR = Symbol('REQUEST_AUTHENTICATOR');

/**
 * Einziger Auth-Guard für fachliche Controller. Er delegiert an `AzureJwtGuard` (Bestand) oder
 * `SessionAuthGuard` (Keycloak-BFF), sodass Controller den Anmeldeweg nicht kennen müssen.
 * Danach steht in `request.user` ein `HubPrincipal`.
 */
@Injectable()
export class HubAuthGuard implements CanActivate {
  constructor(@Inject(REQUEST_AUTHENTICATOR) private readonly authenticator: CanActivate) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    return this.authenticator.canActivate(context);
  }
}
