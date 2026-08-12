import {
  APP_INITIALIZER,
  ApplicationConfig,
  inject,
  isDevMode,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideServiceWorker } from '@angular/service-worker';
import { provideTransloco } from '@jsverse/transloco';
import {
  MSAL_BROADCAST_CONFIG,
  MSAL_GUARD_CONFIG,
  MSAL_INSTANCE,
  MSAL_INTERCEPTOR_CONFIG,
  MsalBroadcastService,
  MsalInterceptor,
  MsalService,
} from '@azure/msal-angular';
import { firstValueFrom } from 'rxjs';
import { routes } from './app.routes';
import { TranslocoHttpLoader } from './core/i18n/transloco-loader';
import { APP_LOCALE_CODES, DEFAULT_APP_LOCALE } from './core/models/locale.model';
import { LocalePreferencesService } from './core/services/locale-preferences.service';
import {
  msalGuardConfigFactory,
  msalInstanceFactory,
  msalInterceptorConfigFactory,
} from './core/auth/msal-config';
import { TabletSessionInterceptor } from './core/auth/tablet-session.interceptor';

function initializeLocale(): () => void {
  const localePreferences = inject(LocalePreferencesService);
  return () => {
    localePreferences.init();
  };
}

/**
 * Processes the Azure AD redirect response (the `#code=...` hash after a login/logout redirect) on
 * every page load, before the router's initial navigation runs `authGuard`. Mandatory per MSAL docs
 * because this app uses standalone components (no `MsalRedirectComponent`/`NgModule` bootstrap).
 */
function initializeMsal(): () => Promise<void> {
  const msalService = inject(MsalService);
  return async () => {
    try {
      await firstValueFrom(msalService.handleRedirectObservable());
    } catch (error) {
      console.error('[MSAL] handleRedirectObservable failed', error);
    }
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptorsFromDi()),
    provideAnimations(),
    provideTransloco({
      config: {
        availableLangs: [...APP_LOCALE_CODES],
        defaultLang: DEFAULT_APP_LOCALE,
        fallbackLang: DEFAULT_APP_LOCALE,
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader,
    }),
    {
      provide: APP_INITIALIZER,
      useFactory: initializeLocale,
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initializeMsal,
      multi: true,
    },
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    { provide: MSAL_INSTANCE, useFactory: msalInstanceFactory },
    { provide: MSAL_GUARD_CONFIG, useFactory: msalGuardConfigFactory },
    { provide: MSAL_INTERCEPTOR_CONFIG, useFactory: msalInterceptorConfigFactory },
    // Replays events fired during the APP_INITIALIZER redirect handling to late subscribers
    // (e.g. AuthService), which would otherwise miss the LOGIN_SUCCESS event.
    { provide: MSAL_BROADCAST_CONFIG, useValue: { eventsToReplay: 5 } },
    { provide: HTTP_INTERCEPTORS, useClass: MsalInterceptor, multi: true },
    // Für Tablet-Sitzungen (siehe ADR-12) - läuft neben `MsalInterceptor`, greift aber nur, wenn
    // tatsächlich eine Tablet-Sitzung aktiv ist (siehe `TabletSessionInterceptor`).
    { provide: HTTP_INTERCEPTORS, useClass: TabletSessionInterceptor, multi: true },
    MsalService,
    MsalBroadcastService,
  ],
};
