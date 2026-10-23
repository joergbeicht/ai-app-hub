import { InjectionToken } from '@angular/core';

/**
 * Values that differ per deployment target (cluster/customer tenant) and must therefore never be
 * baked into the JS bundle at build time (see `deployment.mdc`: one image, many clusters, only
 * Helm-Values/ConfigMap differ - no rebuild per environment).
 *
 * Populated from `runtime-config.json`, which is generated at container *start*, not at build time:
 * - Dev (`ng serve`/Docker Compose): `scripts/write-runtime-config.cjs` writes it from env vars.
 * - Production (nginx image): `docker/docker-entrypoint.d/20-generate-runtime-config.sh` renders it
 *   from `runtime-config.template.json` via `envsubst`, using env vars injected by the Helm chart.
 */
export interface RuntimeConfig {
  readonly clusterName: string;
  readonly azureTenantId: string;
  readonly azureClientId: string;
  /** Basis-URL des `app-hub-backend` (Rollenverwaltung, siehe ADR-6) - pro Cluster unterschiedlich. */
  readonly backendApiUrl: string;
  /** Anmeldeweg (ADR-19): `entra` = MSAL-Bestand, `keycloak` = Backend-BFF mit Session-Cookie. */
  readonly authMode: AuthMode;
}

export type AuthMode = 'entra' | 'keycloak';

const KEYCLOAK_AUTH_MODE: AuthMode = 'keycloak';
const DEFAULT_AUTH_MODE: AuthMode = 'entra';

export const RUNTIME_CONFIG = new InjectionToken<RuntimeConfig>('RUNTIME_CONFIG');

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;

/**
 * Fetches `runtime-config.json` before Angular bootstraps. Must resolve before `bootstrapApplication`
 * is called (see `main.ts`) because the MSAL instance factory (`msalInstanceFactory`) needs
 * `azureTenantId`/`azureClientId` synchronously the first time `MsalService` is injected.
 *
 * Retries transient failures (cold pod, brief ingress hiccup, ...): before this existed, a single
 * failed fetch here meant `bootstrapApplication` was never even called - a permanently blank white
 * page with zero user-facing feedback, only a `console.error` (see ADR-16). A second page load
 * (e.g. navigating to `/login`) then "fixed" it by simply retrying, which looked like a real bug
 * (misread as an expired Azure session) but was really just a missing retry here.
 */
export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fetchRuntimeConfig();
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }
  throw lastError;
}

async function fetchRuntimeConfig(): Promise<RuntimeConfig> {
  const res = await fetch(`runtime-config.json?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to load runtime-config.json: ${res.status}`);
  }
  const raw = (await res.json()) as Omit<RuntimeConfig, 'authMode'> & { authMode?: string };
  return { ...raw, authMode: resolveAuthMode(raw.authMode) };
}

/** Bestehende Cluster liefern kein (oder ein leeres) `authMode` und bleiben beim MSAL-Bestand. */
function resolveAuthMode(raw: string | undefined): AuthMode {
  return raw?.trim().toLowerCase() === KEYCLOAK_AUTH_MODE ? KEYCLOAK_AUTH_MODE : DEFAULT_AUTH_MODE;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
