import { inject } from '@angular/core';
import type { MsalGuardConfiguration, MsalInterceptorConfiguration } from '@azure/msal-angular';
import {
  BrowserCacheLocation,
  InteractionType,
  IPublicClientApplication,
  LogLevel,
  PublicClientApplication,
} from '@azure/msal-browser';
import { RUNTIME_CONFIG } from '../runtime-config';

/**
 * "Expose an API"-Scope der App-Registrierung für Aufrufe des eigenen `app-hub-backend`
 * (Rollenverwaltung, siehe ADR-6). `access_as_user` ist der von Azure beim Anlegen einer API
 * vorgeschlagene Default-Scope-Name - muss auf Azure-Seite mit exakt diesem Namen angelegt sein,
 * sonst schlägt der Silent-Token-Acquire für Backend-Aufrufe fehl (siehe README/ADR-6).
 */
export function backendApiScope(azureClientId: string): string {
  return `api://${azureClientId}/access_as_user`;
}

/**
 * Azure Entra ID – Standard-IdP der Axora-Plattform (siehe `platform-architecture.mdc`).
 * Tenant-ID/Client-ID kommen aus `RUNTIME_CONFIG` (siehe `core/runtime-config.ts`), nicht aus
 * Compile-Konstanten: jeder Kunde bekommt seinen eigenen Azure-Tenant/App-Registrierung, ein
 * einmal gebautes Image darf dafür nicht neu gebaut werden müssen (`deployment.mdc`). Beide Werte
 * sind ohnehin keine Geheimnisse (öffentliche SPA-Identifier, PKCE statt Client-Secret).
 *
 * Bekannte offene Punkte auf Azure-Seite für den aktuellen Test-Tenant (siehe ADR-2):
 * - Nur `http://localhost:6054` ist als Redirect-URI registriert. HTTPS-Dev/LAN-URLs
 *   (`https://localhost:6054`, LAN-/`.local`-Hostnamen für die iPad-Demo) sind NICHT registriert –
 *   Login schlägt dort mit `AADSTS50011` fehl, bis das Azure-Team weitere Redirect-URIs ergänzt.
 * - App Roles (`User`/`Administrator`/`Guest`) sind angelegt, aber noch niemandem zugewiesen –
 *   der `roles`-Claim ist bis dahin leer (siehe `resolvePrimaryRole` in `user.model.ts`).
 */
export function msalInstanceFactory(): IPublicClientApplication {
  const { azureTenantId, azureClientId } = inject(RUNTIME_CONFIG);
  return new PublicClientApplication({
    auth: {
      clientId: azureClientId,
      authority: `https://login.microsoftonline.com/${azureTenantId}`,
      // Dynamisch statt fest verdrahtet: passt sich http/https + Hostname (localhost/LAN-IP/.local)
      // automatisch an. Muss trotzdem in Azure als Redirect-URI hinterlegt sein (siehe oben).
      redirectUri: window.location.origin,
      postLogoutRedirectUri: window.location.origin,
    },
    cache: {
      cacheLocation: BrowserCacheLocation.LocalStorage,
    },
    system: {
      loggerOptions: {
        loggerCallback: (level, message) => {
          if (level === LogLevel.Error) {
            console.error('[MSAL]', message);
          }
        },
        logLevel: LogLevel.Warning,
        piiLoggingEnabled: false,
      },
    },
  });
}

/**
 * Aktuell nicht der Login-Pfad selbst (`AuthService.login()` ruft `loginRedirect()` mit eigenen,
 * expliziten Scopes auf, siehe dort) - dieser Provider wird nur gebraucht, falls künftig die
 * MSAL-eigene `MsalGuard` statt des schlanken `authGuard` zum Einsatz kommt. Scopes hier bewusst
 * identisch zu `AuthService.login()` halten, damit beide Wege dasselbe Consent anfordern.
 */
export function msalGuardConfigFactory(): MsalGuardConfiguration {
  const { azureClientId } = inject(RUNTIME_CONFIG);
  return {
    interactionType: InteractionType.Redirect,
    authRequest: {
      scopes: ['openid', 'profile', backendApiScope(azureClientId)],
    },
    loginFailedRoute: '/login',
  };
}

export function msalInterceptorConfigFactory(): MsalInterceptorConfiguration {
  const { azureClientId, backendApiUrl } = inject(RUNTIME_CONFIG);
  // Bewusst auf `/users`(`/*`) beschränkt statt `/*`: `/badge-login/*` (siehe ADR-7, "Weg A") wird
  // VOR dem eigentlichen Login aufgerufen, wenn noch kein Access Token existiert - der Interceptor
  // darf dort keinen (interaktiven) Token-Acquire auslösen. Zwei Einträge nötig, weil der
  // Interceptor `*` strikt/verankert matcht (`^/users/.*$`) - `/users/*` allein würde das exakte
  // `GET /users` (ohne folgenden Pfad) NICHT abdecken.
  const scopes = [backendApiScope(azureClientId)];
  return {
    interactionType: InteractionType.Redirect,
    protectedResourceMap: new Map([
      [`${backendApiUrl}/users`, scopes],
      [`${backendApiUrl}/users/*`, scopes],
    ]),
  };
}
