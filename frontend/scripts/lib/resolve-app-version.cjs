#!/usr/bin/env node
/**
 * Resolves the app version, in order of precedence:
 * 1) process.env.APP_VERSION (CI / explicit override)
 * 2) nearest SemVer git tag (`git describe --tags --abbrev=0`)
 *    In Docker Compose the repo .git is bind-mounted read-only at APP_VERSION_GIT_DIR (see
 *    docker-compose.yml) - no host-side wrapper script needed, `docker compose up` alone works.
 *
 * Shared by write-app-version.cjs (compiled-in constant) and
 * write-build-version-json.cjs (runtime-fetchable version.json) so both
 * always agree on the same version for a given build.
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const frontendRoot = path.resolve(__dirname, '..', '..');

function normalizeVersion(raw) {
  const v = String(raw ?? '')
    .trim()
    .replace(/^v/i, '');
  return v || null;
}

function fromEnv() {
  return normalizeVersion(process.env.APP_VERSION);
}

function fromGit() {
  try {
    const gitDir = process.env.GIT_DIR || process.env.APP_VERSION_GIT_DIR;
    // Bind-mounted .git is owned by the host user; Alpine's git otherwise refuses it as
    // "dubious ownership" (CVE-2022-24765 safe.directory check) - safe here, read-only mount.
    const args = gitDir
      ? ['-c', 'safe.directory=*', '--git-dir', gitDir, 'describe', '--tags', '--abbrev=0']
      : ['-c', 'safe.directory=*', 'describe', '--tags', '--abbrev=0'];
    const result = spawnSync('git', args, {
      encoding: 'utf8',
      cwd: frontendRoot,
    });
    if (result.status !== 0) return null;
    return normalizeVersion(result.stdout);
  } catch {
    return null;
  }
}

function resolveAppVersion() {
  return fromEnv() || fromGit();
}

module.exports = { resolveAppVersion };
