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
}

export const RUNTIME_CONFIG = new InjectionToken<RuntimeConfig>('RUNTIME_CONFIG');

/**
 * Fetches `runtime-config.json` before Angular bootstraps. Must resolve before `bootstrapApplication`
 * is called (see `main.ts`) because the MSAL instance factory (`msalInstanceFactory`) needs
 * `azureTenantId`/`azureClientId` synchronously the first time `MsalService` is injected.
 */
export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  const res = await fetch(`runtime-config.json?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to load runtime-config.json: ${res.status}`);
  }
  return (await res.json()) as RuntimeConfig;
}
