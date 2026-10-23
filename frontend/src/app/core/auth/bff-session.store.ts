import { Injectable, signal } from '@angular/core';

/** Antwort von `GET /auth/session` des Backend-BFF (ADR-19) - enthält bewusst kein Token. */
export interface BffSession {
  user: {
    id: string;
    displayName: string;
    email: string | null;
    roles: string[];
  };
  csrfToken: string;
}

/**
 * Hält die aktuelle BFF-Sitzung. Eigener Store statt Zustand in `BffAuthService`, weil der
 * `BffSessionInterceptor` das CSRF-Token braucht und `BffAuthService` selbst `HttpClient`
 * nutzt - sonst entstünde ein DI-Zyklus über die HTTP-Interceptor-Kette.
 */
@Injectable({ providedIn: 'root' })
export class BffSessionStore {
  private readonly _session = signal<BffSession | null>(null);

  readonly session = this._session.asReadonly();

  set(session: BffSession): void {
    this._session.set(session);
  }

  clear(): void {
    this._session.set(null);
  }
}
