#!/usr/bin/env node
/**
 * Writes frontend/public/version.json for local dev (ng serve / Docker Compose) - the dev-mode
 * counterpart to `write-build-version-json.cjs` (which only runs as `postbuild`, i.e. after a real
 * `ng build`). Without this, `PwaUpdateService.checkVersionFile()` (see ADR-13) always gets a 404
 * in dev, because `ng serve` never runs the production build/postbuild pipeline that normally
 * creates this file.
 *
 * Safe to generate up-front here (unlike in production): the Angular service worker - the whole
 * reason `write-build-version-json.cjs` must run AFTER the build - is hard-disabled in dev mode
 * (`provideServiceWorker(..., { enabled: !isDevMode() })`, see app.config.ts), so there is no
 * asset-manifest/cache to accidentally capture a stale copy of this file.
 *
 * Called via prestart / prestart:docker (see package.json), same as write-runtime-config.cjs.
 */
const fs = require('node:fs');
const path = require('node:path');
const { resolveAppVersion } = require('./lib/resolve-app-version.cjs');

const frontendRoot = path.resolve(__dirname, '..');
const outPath = path.join(frontendRoot, 'public/version.json');

const version = resolveAppVersion();

if (!version) {
  // Same version source as write-app-version.cjs (prestart) - if that step succeeded, this can
  // only fail if the git tag disappeared mid-run.
  console.error('[write-dev-version-json] ERROR: No app version available.');
  process.exit(1);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify({ version }, null, 2)}\n`, 'utf8');

console.log(`[write-dev-version-json] version.json written, version=${version}`);
