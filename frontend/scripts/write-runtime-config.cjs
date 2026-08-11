#!/usr/bin/env node
/**
 * Writes frontend/public/runtime-config.json for local dev (ng serve / Docker Compose).
 *
 * Mirrors what the production nginx image does at container *start* via
 * `docker/docker-entrypoint.d/20-generate-runtime-config.sh` + `envsubst` - same file, same shape,
 * just a different generator, so the Angular app (`core/runtime-config.ts`) stays unaware of which
 * environment it runs in. See `deployment.mdc`: values that differ per cluster/customer tenant must
 * never be baked into the JS bundle at build time.
 *
 * Called via prestart / prestart:docker (see package.json) - NOT prebuild, so a production build
 * ships the untouched `runtime-config.template.json` for the nginx entrypoint to fill in.
 */
const fs = require('node:fs');
const path = require('node:path');

const frontendRoot = path.resolve(__dirname, '..');
const outPath = path.join(frontendRoot, 'public/runtime-config.json');

// Confessio-Test-Tenant (siehe ADR-2) - keine Geheimnisse (öffentliche SPA-Identifier, PKCE).
// Nur ein Fallback für lokale Entwicklung ohne extra Env-Setup, nicht für Produktion gedacht.
const DEV_DEFAULTS = {
  clusterName: 'Lokal (Docker Compose)',
  azureTenantId: 'e72e80bb-76d0-4f0c-8dfe-55259ab5c6e8',
  azureClientId: 'c52e2ae0-a32d-46d7-9e1b-a0fdb06ff094',
  // app-hub-backend läuft im selben Docker-Compose-Setup auf Port 6055 (siehe docker-compose.yml).
  backendApiUrl: 'https://localhost:6055',
};

const config = {
  clusterName: process.env.CLUSTER_NAME?.trim() || DEV_DEFAULTS.clusterName,
  azureTenantId: process.env.AZURE_TENANT_ID?.trim() || DEV_DEFAULTS.azureTenantId,
  azureClientId: process.env.AZURE_CLIENT_ID?.trim() || DEV_DEFAULTS.azureClientId,
  backendApiUrl: process.env.BACKEND_API_URL?.trim() || DEV_DEFAULTS.backendApiUrl,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

console.log(`[write-runtime-config] cluster=${config.clusterName} tenant=${config.azureTenantId}`);
