#!/usr/bin/env bash
# Starts Docker from the project root so frontend mounts are correct.
# Resolves APP_VERSION from the nearest SemVer git tag (no package.json fake).
# Ensures local HTTPS certs exist (PWA install affordance / parity with SI).
set -euo pipefail

cd "$(dirname "$0")"

if [[ -z "${APP_VERSION:-}" ]]; then
  if ! TAG="$(git describe --tags --abbrev=0 2>/dev/null)"; then
    echo "ERROR: No git tag found – cannot start without a real version." >&2
    echo "Create a SemVer tag first, e.g.:  git tag v1.0.0 && git push origin v1.0.0" >&2
    echo "Or pass an explicit version:     APP_VERSION=1.0.0 ./start-docker.sh" >&2
    exit 1
  fi
  APP_VERSION="${TAG#v}"
fi

export APP_VERSION
echo "[start-docker] APP_VERSION=${APP_VERSION}"

SSL_CERT="frontend/ssl/local.pem"
SSL_KEY="frontend/ssl/local-key.pem"
if [[ ! -f "$SSL_CERT" || ! -f "$SSL_KEY" ]]; then
  echo "[start-docker] HTTPS certs missing – running ./scripts/setup-ssl.sh"
  ./scripts/setup-ssl.sh
fi

exec docker compose up --build "$@"
