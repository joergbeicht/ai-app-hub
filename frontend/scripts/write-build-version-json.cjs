#!/usr/bin/env node
/**
 * Writes dist/app-hub-frontend/version.json - a small, always-fresh file the
 * running app can fetch (with `cache: 'no-store'`) to detect that a newer
 * build has been deployed, independent of the Angular service worker's own
 * (sometimes delayed) update cycle.
 *
 * Runs as `postbuild` (see package.json) - i.e. AFTER `ng build` has already
 * generated `ngsw.json`. That's the whole point: this file must not exist yet
 * when the service worker's asset manifest is built, otherwise it would be
 * captured by the "assets" group's `*.json` pattern (ngsw-config.json) and
 * the service worker itself would serve a stale cached copy of it - defeating
 * its purpose. Same trick as `runtime-config.json`, which is only generated
 * at container *start* (see docker/docker-entrypoint.d/), just simpler here
 * because the app version is already known at build time.
 */
const fs = require('node:fs');
const path = require('node:path');
const { resolveAppVersion } = require('./lib/resolve-app-version.cjs');

const frontendRoot = path.resolve(__dirname, '..');
const outPath = path.join(frontendRoot, 'dist/app-hub-frontend/version.json');

const version = resolveAppVersion();

if (!version) {
  // Same version source as write-app-version.cjs (prebuild) - if that step
  // succeeded, this can only fail if the git tag disappeared mid-build.
  console.error('[write-build-version-json] ERROR: No app version available.');
  process.exit(1);
}

if (!fs.existsSync(path.dirname(outPath))) {
  console.error(
    `[write-build-version-json] ERROR: ${path.dirname(outPath)} does not exist - did "ng build" run first?`,
  );
  process.exit(1);
}

fs.writeFileSync(outPath, `${JSON.stringify({ version }, null, 2)}\n`, 'utf8');

console.log(`[write-build-version-json] version.json written, version=${version}`);
