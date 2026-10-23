import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { loadRuntimeConfig, RUNTIME_CONFIG } from './app/core/runtime-config';

/**
 * Runtime config (cluster name, Azure tenant/client ID) must be resolved *before* bootstrap: the
 * MSAL instance factory reads it synchronously via `inject()`, so it has to already be in the DI
 * container by the time anything first injects `MsalService`. See `core/runtime-config.ts`.
 */
loadRuntimeConfig()
  .then((runtimeConfig) =>
    bootstrapApplication(AppComponent, {
      providers: [...appConfig.providers, { provide: RUNTIME_CONFIG, useValue: runtimeConfig }],
    }),
  )
  .catch((err) => {
    console.error('[bootstrap] Application failed to start', err);
    renderBootstrapErrorFallback();
  });

/**
 * Last-resort fallback if `loadRuntimeConfig()` fails even after its built-in retries, or
 * `bootstrapApplication` itself throws - i.e. Angular never starts. Without this, the browser just
 * shows a permanently blank white page (only `index.html`'s static `<title>` loaded) with zero
 * feedback (see ADR-16). Plain DOM/inline styles only, no Transloco/i18n possible here - Angular,
 * and with it every service, hasn't started yet. Kept deliberately bilingual (DE/EN) instead of
 * wired to the app's i18n system, which is the one legitimate exception to the "always via i18n"
 * rule for user-facing text (see `00-general.mdc`).
 */
function renderBootstrapErrorFallback(): void {
  document.body.innerHTML = `
    <div style="
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      min-height: 100vh; padding: 2rem; text-align: center; gap: 1rem;
      font-family: Roboto, Arial, sans-serif; background: #10131a; color: #e6e8ec;
    ">
      <p style="margin: 0; font-size: 1.1rem;">
        Die Anwendung konnte nicht geladen werden. Bitte Seite neu laden.<br />
        <span style="color: #9aa3af; font-size: 0.9rem;">
          The application failed to start. Please reload the page.
        </span>
      </p>
      <button
        onclick="location.reload()"
        style="
          padding: 0.6rem 1.5rem; border-radius: 999px; border: 1px solid #4f7cff;
          background: transparent; color: #9db4ff; font-size: 1rem; cursor: pointer;
        "
      >
        Neu laden / Reload
      </button>
    </div>
  `;
}
