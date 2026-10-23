#!/bin/sh
set -e

# Dev-Entrypoint (Docker Compose): wartet auf Postgres und hält Schema/node_modules aktuell,
# bevor der eigentliche Server (per docker-compose "command:" überschrieben, siehe CMD unten)
# startet - ohne DB würde jeder Request an /hub-apps sofort crashen (siehe ADR-17, PrismaService).
# `node_modules` liegt in einem benannten Volume (siehe docker-compose.yml) - das überlebt Image-
# Rebuilds unverändert, daher muss `ensure-node-modules.cjs` VOR "npx prisma ..." laufen, sonst
# fehlt ein frisch hinzugefügtes Package (z. B. gerade "prisma") noch im Volume.
echo "📦 Ensuring node_modules is up to date..."
node scripts/ensure-node-modules.cjs

echo "⏳ Waiting for database..."
until pg_isready -d "$DATABASE_URL" > /dev/null 2>&1; do
  echo "   Database is unavailable - sleeping"
  sleep 1
done
echo "✅ Database is ready!"

echo "📦 Running database migrations..."
npx prisma migrate deploy
npx prisma generate

exec "$@"
