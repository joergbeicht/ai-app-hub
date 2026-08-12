import { Injectable, inject } from '@angular/core';
import type { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import type { Observable } from 'rxjs';
import { RUNTIME_CONFIG } from '../runtime-config';
import { TabletAuthService } from '../services/tablet-auth.service';

/**
 * Hängt das eigene, kurzlebige Session-Token einer Tablet-Sitzung an Backend-Aufrufe an (siehe
 * ADR-12) - parallel zum `MsalInterceptor` (der für MSAL-Konten dasselbe mit Entra-Access-Tokens
 * macht, siehe `msal-config.ts`). Beide Interceptor laufen nebeneinander, weil ein Browser zu
 * jedem Zeitpunkt entweder eine MSAL-Sitzung ODER eine Tablet-Sitzung hat, nie beide gleichzeitig.
 * Greift bewusst nicht für `/tablet-auth/*` selbst - das ist ja gerade der (unauthentifizierte)
 * Login-Aufruf.
 */
@Injectable()
export class TabletSessionInterceptor implements HttpInterceptor {
  private readonly tabletAuthService = inject(TabletAuthService);
  private readonly backendApiUrl = inject(RUNTIME_CONFIG).backendApiUrl;

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const session = this.tabletAuthService.session();
    if (
      !session ||
      !request.url.startsWith(this.backendApiUrl) ||
      request.url.includes('/tablet-auth/')
    ) {
      return next.handle(request);
    }
    return next.handle(
      request.clone({ setHeaders: { Authorization: `Bearer ${session.sessionToken}` } }),
    );
  }
}
