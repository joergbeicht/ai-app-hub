import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { MsalBroadcastService, MsalService } from '@azure/msal-angular';
import type { AccountInfo } from '@azure/msal-browser';
import { EventType, InteractionStatus } from '@azure/msal-browser';
import { filter } from 'rxjs/operators';
import { resolvePrimaryRole, type HubUser } from '../models/user.model';
import { RUNTIME_CONFIG } from '../runtime-config';
import { backendApiScope } from '../auth/msal-config';
import { TabletAuthService, type TabletSession } from './tablet-auth.service';

/** Custom claim added by the `ai-app-hub` App Roles (see ADR-2) – not part of MSAL's base types. */
interface AppRoleClaims {
  roles?: string[];
}

/**
 * Wraps MSAL (`MsalService`/`MsalBroadcastService`) behind the same small API the rest of the app
 * already used for the login fake, so `authGuard`, `app.component.ts` and the login page don't need
 * to know about MSAL directly (Dependency Inversion). Sign-in/out use the redirect flow – actual
 * redirect handling happens once at bootstrap, see `initializeMsal` in `app.config.ts`.
 *
 * Zusätzlich zur MSAL-Sitzung gibt es seit ADR-12 eine zweite, unabhängige Sitzungsquelle für
 * Tablet-Benutzer (`TabletAuthService`, PIN+ROPC statt MSAL-Redirect) - `currentUser`/`isLoggedIn`
 * fassen beide hinter derselben Fassade zusammen, damit `authGuard`/Router/restliche Komponenten
 * den Unterschied nicht kennen müssen (siehe ADR-12, "PC-Login bleibt komplett unberührt").
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly msalService = inject(MsalService);
  private readonly msalBroadcastService = inject(MsalBroadcastService);
  private readonly tabletAuthService = inject(TabletAuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly azureClientId = inject(RUNTIME_CONFIG).azureClientId;

  private readonly _msalUser = signal<HubUser | null>(this.mapAccount(this.getAccount()));
  private readonly _tabletUser = computed(() =>
    this.mapTabletSession(this.tabletAuthService.session()),
  );

  readonly currentUser = computed(() => this._tabletUser() ?? this._msalUser());
  readonly isLoggedIn = computed(() => this.currentUser() !== null);

  constructor() {
    this.msalBroadcastService.msalSubject$
      .pipe(
        filter((message) => message.eventType === EventType.LOGIN_SUCCESS),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((message) => {
        const account = (message.payload as { account?: AccountInfo } | null)?.account;
        if (account) {
          this.msalService.instance.setActiveAccount(account);
        }
      });

    // Re-syncs after every completed interaction (redirect-back after login, logout, ...).
    this.msalBroadcastService.inProgress$
      .pipe(
        filter((status) => status === InteractionStatus.None),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this._msalUser.set(this.mapAccount(this.getAccount())));
  }

  /**
   * `loginRedirect()` ohne `authRequest` würde nur die MSAL-Standard-Scopes (`openid`/`profile`)
   * anfordern - der Backend-API-Scope (siehe ADR-6, `msal-config.ts`) muss hier explizit mit
   * angefordert werden, sonst gibt es beim ersten Backend-Aufruf einen zusätzlichen,
   * überraschenden Redirect zum Nachfordern der Einwilligung.
   *
   * `loginHint`: überspringt auf der Microsoft-gehosteten Login-Seite die Benutzername-Eingabe
   * und zeigt direkt das Passwortfeld für genau diese Person an. Für Tablet-Benutzer wird dieser
   * MSAL-Redirect-Pfad seit ADR-12 nicht mehr über den Ausweis-Scan ausgelöst (siehe
   * `TabletAuthService`) - `loginHint` bleibt für andere Fälle nutzbar.
   */
  login(loginHint?: string): void {
    this.msalService.loginRedirect({
      scopes: ['openid', 'profile', backendApiScope(this.azureClientId)],
      ...(loginHint ? { loginHint } : {}),
    });
  }

  logout(): void {
    // Tablet-Sitzung hat keinen MSAL-Account, den `logoutRedirect()` beenden könnte (siehe
    // ADR-12) - eigener, lokaler Logout statt Redirect zu Entra. Anders als bei MSAL (Redirect
    // zu Entra und zurück) muss hier explizit zu `/login` navigiert werden - der `authGuard`
    // läuft nur bei Navigation, nicht reaktiv bei Signal-Änderungen, sonst bliebe die zuvor
    // geschützte Seite (ohne Toolbar) einfach stehen ("eingefrorener Bildschirm").
    if (this._tabletUser()) {
      this.tabletAuthService.logout();
      void this.router.navigateByUrl('/login');
      return;
    }
    this.msalService.logoutRedirect();
  }

  private getAccount(): AccountInfo | null {
    return (
      this.msalService.instance.getActiveAccount() ??
      this.msalService.instance.getAllAccounts()[0] ??
      null
    );
  }

  private mapAccount(account: AccountInfo | null): HubUser | null {
    if (!account) {
      return null;
    }
    const claims = account.idTokenClaims as AppRoleClaims | undefined;
    return {
      id: account.homeAccountId,
      displayName: account.name ?? account.username,
      email: account.username,
      role: resolvePrimaryRole(claims?.roles),
    };
  }

  private mapTabletSession(session: TabletSession | null): HubUser | null {
    if (!session) {
      return null;
    }
    return {
      id: session.userPrincipalName,
      displayName: session.displayName,
      email: session.userPrincipalName,
      role: resolvePrimaryRole(session.roles),
    };
  }
}
