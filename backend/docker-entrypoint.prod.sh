#!/bin/sh
set -e

# Produktions-Entrypoint (siehe ADR-17): bewusst OHNE "|| true" - eine unerreichbare DB oder eine
# fehlgeschlagene Migration muss den Rollout sichtbar stoppen (Pod bleibt "CrashLoopBackOff"),
# statt mit veraltetem/inkonsistentem Schema stillschweigend weiterzulaufen.
if [ -z "$DATABASE_URL" ]; then
  echo "FEHLER: DATABASE_URL ist nicht gesetzt." >&2
  exit 1
fi

echo "Warte auf Datenbank..."
until pg_isready -d "$DATABASE_URL" > /dev/null 2>&1; do
  echo "   Datenbank noch nicht erreichbar - warte..."
  sleep 1
done
echo "Datenbank ist erreichbar."

echo "Fuehre Prisma-Migrationen aus (migrate deploy)..."
node node_modules/.bin/prisma migrate deploy

echo "Starte Anwendung..."
exec "$@"
