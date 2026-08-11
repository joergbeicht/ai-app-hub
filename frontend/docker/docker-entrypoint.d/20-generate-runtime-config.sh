#!/bin/sh
# Renders runtime-config.json from runtime-config.template.json via envsubst, at container *start*
# (not at image build) - so the same image can be deployed to any customer cluster/Azure tenant,
# just by setting different env vars via Helm-Values (see deployment.mdc / platform-architecture.mdc).
# Runs automatically: nginx's own entrypoint executes every *.sh in /docker-entrypoint.d/ before
# starting nginx (official nginx:alpine image behaviour, no custom ENTRYPOINT needed here).
set -eu

: "${AZURE_TENANT_ID:?AZURE_TENANT_ID is required (per-cluster Helm value, see platform-architecture.mdc)}"
: "${AZURE_CLIENT_ID:?AZURE_CLIENT_ID is required (per-cluster Helm value, see platform-architecture.mdc)}"
: "${BACKEND_API_URL:?BACKEND_API_URL is required (per-cluster Helm value, see ADR-6 - URL des app-hub-backend)}"
export CLUSTER_NAME="${CLUSTER_NAME:-Unbekannt}"

HTML_ROOT=/usr/share/nginx/html
TEMPLATE="$HTML_ROOT/runtime-config.template.json"
TARGET="$HTML_ROOT/runtime-config.json"

envsubst '${CLUSTER_NAME} ${AZURE_TENANT_ID} ${AZURE_CLIENT_ID} ${BACKEND_API_URL}' <"$TEMPLATE" >"$TARGET"
rm -f "$TEMPLATE"

echo "[runtime-config] wrote $TARGET (cluster=$CLUSTER_NAME)"
