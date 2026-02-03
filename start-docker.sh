#!/usr/bin/env bash
# Startet Docker immer aus dem Projektroot – damit der Volume-Mount ./frontend/src
# auf genau dieses Verzeichnis zeigt und Änderungen an konfiguration.json sichtbar sind.
cd "$(dirname "$0")"
exec docker compose up --build "$@"
