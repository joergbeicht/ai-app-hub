const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const packageLockPath = path.join(projectRoot, 'package-lock.json');
const packageJsonPath = path.join(projectRoot, 'package.json');
const nodeModulesPath = path.join(projectRoot, 'node_modules');
const stampPath = path.join(nodeModulesPath, '.package-lock.hash');

function fileHash(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function hasRequiredPackage() {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  return Object.keys(allDeps).every((name) =>
    fs.existsSync(path.join(nodeModulesPath, name, 'package.json')),
  );
}

const currentHash = fileHash(packageLockPath) || fileHash(packageJsonPath);
const recordedHash = fs.existsSync(stampPath) ? fs.readFileSync(stampPath, 'utf8').trim() : null;
const needsInstall =
  !fs.existsSync(nodeModulesPath) ||
  !recordedHash ||
  recordedHash !== currentHash ||
  !hasRequiredPackage();

if (!needsInstall) {
  console.log('[ensure-node-modules] node_modules is up to date');
  process.exit(0);
}

console.log('[ensure-node-modules] dependency change detected, running npm ci');
const result = spawnSync('npm', ['ci', '--legacy-peer-deps'], {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

fs.writeFileSync(stampPath, `${currentHash}\n`);
console.log('[ensure-node-modules] node_modules refreshed');
