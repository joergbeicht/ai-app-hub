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
  .catch((err) => console.error(err));
