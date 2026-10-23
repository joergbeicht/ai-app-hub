import { HttpClient, HttpErrorResponse, HttpStatusCode } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { Router, type UrlTree } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { BROWSER_NAVIGATION } from '../auth/browser-navigation';
import { BffSessionStore, type BffSession } from '../auth/bff-session.store';
import { resolvePrimaryRole, type HubUser } from '../models/user.model';
import { RUNTIME_CONFIG } from '../runtime-config';
import { AuthService } from './auth.service';

interface LogoutResponse {
  logoutUrl: string;
}

const LOGIN_PATH = '/login';
const DEFAULT_RETURN_TO = '/';
const SESSION_CHECK_FAILED_ERROR = 'unavailable';

/**
 * Anmeldung über Keycloak mit dem Backend als BFF (ADR-19): Der Browser sieht nie ein Token,
 * nur das HttpOnly-Session-Cookie des Backends. Login und Logout sind Seitenwechsel, weil
 * Keycloak die Anmeldung als Top-Level-Seite zeigt.
 */
@Injectable({ providedIn: 'root' })
export class BffAuthService extends AuthService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(BffSessionStore);
  private readonly router = inject(Router);
  private readonly navigateTo = inject(BROWSER_NAVIGATION);
  private readonly backendApiUrl = inject(RUNTIME_CONFIG).backendApiUrl;

  readonly currentUser = computed(() => toHubUser(this.store.session()));
  readonly isLoggedIn = computed(() => this.currentUser() !== null);

  private sessionCheckFailed = false;

  /** Läuft vor der ersten Navigation, damit `authGuard` eine bestehende Sitzung schon kennt. */
  async restoreSession(): Promise<void> {
    try {
      const session = await firstValueFrom(
        this.http.get<BffSession>(`${this.backendApiUrl}/auth/session`),
      );
      this.store.set(session);
      this.sessionCheckFailed = false;
    } catch (error) {
      this.store.clear();
      this.sessionCheckFailed = !isUnauthorized(error);
      if (this.sessionCheckFailed) {
        console.warn('[auth] Session konnte nicht geladen werden', error);
      }
    }
  }

  /** `returnTo` prüft das Backend selbst (nur relative Pfade, kein Open Redirect). */
  login(returnTo: string = DEFAULT_RETURN_TO): void {
    this.navigateTo(`${this.backendApiUrl}/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  /**
   * Keine Zwischenseite: Keycloak ist die Login-Seite (Top-Level-Redirect, ADR-19). Ist die
   * Sitzungsprüfung selbst gescheitert (Backend/IAM gestört), führte Keycloak per SSO sofort
   * zurück und die Prüfung scheiterte erneut - daher dann die Login-Seite mit Fehlermeldung.
   */
  redirectToLogin(returnTo: string): UrlTree | false {
    if (this.sessionCheckFailed) {
      return this.router.createUrlTree([LOGIN_PATH], {
        queryParams: { error: SESSION_CHECK_FAILED_ERROR },
      });
    }
    this.login(returnTo);
    return false;
  }

  /** Beendet zuerst die Hub-Sitzung, dann die Keycloak-SSO-Sitzung über deren Logout-Seite. */
  logout(): void {
    this.http.post<LogoutResponse>(`${this.backendApiUrl}/auth/logout`, null).subscribe({
      next: ({ logoutUrl }) => {
        this.store.clear();
        this.navigateTo(logoutUrl);
      },
      error: () => {
        this.store.clear();
        void this.router.navigateByUrl(LOGIN_PATH);
      },
    });
  }
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === HttpStatusCode.Unauthorized;
}

function toHubUser(session: BffSession | null): HubUser | null {
  if (!session) {
    return null;
  }
  const { user } = session;
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email ?? '',
    role: resolvePrimaryRole(user.roles),
  };
}
