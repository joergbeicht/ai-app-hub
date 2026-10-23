import { Injectable, inject } from '@angular/core';
import {
  HttpErrorResponse,
  HttpStatusCode,
  type HttpEvent,
  type HttpHandler,
  type HttpInterceptor,
  type HttpRequest,
} from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError, type Observable } from 'rxjs';
import { RUNTIME_CONFIG } from '../runtime-config';
import { BffSessionStore } from './bff-session.store';

const CSRF_HEADER = 'X-CSRF-Token';
const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Backend-Aufrufe im Keycloak-Modus (ADR-19): schickt das Session-Cookie mit
 * (`withCredentials`), setzt bei schreibenden Requests das CSRF-Token der Sitzung und führt bei
 * abgelaufener Sitzung zurück zur Login-Seite.
 */
@Injectable()
export class BffSessionInterceptor implements HttpInterceptor {
  private readonly store = inject(BffSessionStore);
  private readonly router = inject(Router);
  private readonly backendApiUrl = inject(RUNTIME_CONFIG).backendApiUrl;

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (!request.url.startsWith(this.backendApiUrl)) {
      return next.handle(request);
    }
    return next.handle(this.withSession(request)).pipe(
      catchError((error: unknown) => {
        this.handleExpiredSession(error);
        return throwError(() => error);
      }),
    );
  }

  private withSession(request: HttpRequest<unknown>): HttpRequest<unknown> {
    const csrfToken = this.store.session()?.csrfToken;
    if (!csrfToken || SAFE_HTTP_METHODS.has(request.method)) {
      return request.clone({ withCredentials: true });
    }
    return request.clone({ withCredentials: true, setHeaders: { [CSRF_HEADER]: csrfToken } });
  }

  /** Nur wenn vorher eine Sitzung bestand - der 401 beim Session-Restore ist der Normalfall. */
  private handleExpiredSession(error: unknown): void {
    const expired = error instanceof HttpErrorResponse && error.status === HttpStatusCode.Unauthorized;
    if (!expired || !this.store.session()) {
      return;
    }
    this.store.clear();
    void this.router.navigate(['/login'], { queryParams: { error: 'session_expired' } });
  }
}
