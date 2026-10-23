#!/usr/bin/env bash
# Convenience wrapper around `docker compose up --build`. Starts Docker from the project root so
# frontend mounts are correct, and ensures local HTTPS certs exist (PWA install affordance / parity
# with SI). Not strictly required anymore: APP_VERSION is resolved automatically INSIDE the
# frontend container from the bind-mounted .git tag (see docker-compose.yml,
# frontend/scripts/lib/resolve-app-version.cjs) - plain `docker compose up` works too.
# Pass APP_VERSION=1.0.0 ./start-docker.sh to override the resolved version explicitly.
set -euo pipefail

cd "$(dirname "$0")"

SSL_CERT="frontend/ssl/local.pem"
SSL_KEY="frontend/ssl/local-key.pem"
if [[ ! -f "$SSL_CERT" || ! -f "$SSL_KEY" ]]; then
  echo "[start-docker] HTTPS certs missing – running ./scripts/setup-ssl.sh"
  ./scripts/setup-ssl.sh
fi

exec docker compose up --build "$@"
