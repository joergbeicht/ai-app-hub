#!/usr/bin/env node
/**
 * Resolves the app version, in order of precedence:
 * 1) process.env.APP_VERSION (required for Docker/CI without a git checkout)
 * 2) nearest SemVer git tag (`git describe --tags --abbrev=0`)
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
    const args = gitDir
      ? ['--git-dir', gitDir, 'describe', '--tags', '--abbrev=0']
      : ['describe', '--tags', '--abbrev=0'];
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
