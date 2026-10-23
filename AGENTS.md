# AGENTS.md – ai-app-hub

Arbeitsanweisungen für Coding-Agents (Cursor). Verbindliche Detailregeln stehen in
`.cursor/rules/*.mdc`; diese Datei ist der Einstieg und wiederholt sie nicht.

## Was ist das?

`ai-app-hub` ist eine Axora-**Fachapplikation**: zentrale Einstiegsseite aller Axora-Apps
(Card-Grid, zentraler App-Katalog in der DB) und künftig das **Verwaltungsfrontend von Axora IAM**
(Benutzer, Gruppen, Rollen, Apps & Lizenzen, Einladungen, Audit).

## Wichtigster Kontext: Übergang zu Axora IAM

- **Zielbild (verbindlich):** `docs/konzepte/axora-iam-konzept-v1.0.md`, ADR-18.
  Keycloak authentifiziert, Axora IAM autorisiert, Browser-Apps nutzen ein BFF mit
  HttpOnly-Session-Cookie.
- **Bestand:** Entra ID + MSAL im Frontend (ADR-2), Rollen über Microsoft Graph (ADR-6),
  `ssoSilent()` (ADR-14), Tablet-Login per Badge + PIN über **ROPC** (ADR-12).
- **Regel:** Bestandscode nur fixen, nicht ausbauen. Keine neuen Features auf MSAL, Graph-Rollen
  oder ROPC. Neue Auth-/Berechtigungsarbeit folgt dem Konzept (`iam.mdc`). ROPC ist laut Konzept
  verboten und muss vor dem B2B-Go-Live ersetzt werden.

## Stack & lokale Umgebung

| Teil | Technik | Lokal |
|---|---|---|
| Frontend | Angular 19 (Standalone, Signals, OnPush), Material, Transloco (de/en/es/fr/tr/it) | https://localhost:6054 |
| Backend | NestJS 10 (`backend/`) | https://localhost:6055 (Host-Port per `BACKEND_HOST_PORT` in `.env`, hier oft 6059) |
| DB | PostgreSQL 16 + Prisma 7 (`backend/prisma/`) | `localhost:6056`, DB `ai_app_hub` |

```bash
./start-docker.sh                 # oder: docker compose up (Hot Reload für frontend/ und backend/)
docker compose logs -f backend    # Backend-Logs
```

Prisma-Migrationen laufen beim Start des Backend-Containers automatisch (`migrate deploy`).
Neue Migration: im Backend `npx prisma migrate dev --name <wirkung>`.

## Qualität vor Abschluss

```bash
cd frontend && npm run lint && npm run test:ci && npm run build
cd backend  && npm run lint && npm test && npm run build
```

Neue Logik kommt mit Tests; bei Bugfixes erst der reproduzierende Test. Für UI-Änderungen im
Browser prüfen (`01-browser-tools.mdc`), Overlays auf deckenden Hintergrund (`angular-material.mdc`).

## Projektstruktur

```text
frontend/             Angular-App (src/app/core, src/app/features, src/assets/i18n/<scope>/)
backend/              NestJS (src/<feature>/), prisma/, scripts/ (Seeds, Provisionierung)
helm/                 Charts für Frontend, Backend, Ingress (confessio-test/-prod)
infra/bicep/          Azure-Infrastruktur (ACR, AKS pro Kunde)
.github/workflows/    CI (frontend-ci, backend-ci) und Deploys (confessio-test, confessio-prod)
docs/                 Konzepte, ADRs, Leistungsbeschreibung – Einstieg docs/README.md
```

## Bekannte Fallstricke

- **App-Katalog (ADR-17):** Die DB ist die einzige Wahrheit. `konfiguration.json` ist nur
  Seed-Quelle. Den Seed vom Host ausführen:
  `cd backend && DATABASE_URL=postgresql://postgres:password@localhost:6056/ai_app_hub npm run seed:hub-apps`.
  Er überschreibt Admin-Änderungen an denselben IDs. Eine neue App-Card braucht in deployten
  Clustern einen `PUT /hub-apps` (Admin) oder einen Seed-Lauf gegen die Cluster-DB.
- **Neue Backend-Route mit Auth:** im Frontend in `protectedResourceMap` (`msal-config.ts`)
  eintragen, sonst fehlt das Token (Bestand bis BFF-Umbau).
- **localStorage** enthält nur persönliche Präferenzen (`app-hub-personal-preferences`), nie
  Katalog- oder Fachdaten, nie Tokens.
- **Fehlerbehandlung im Backend:** Der globale `AllExceptionsFilter` fängt Nicht-HTTP-Fehler
  (z. B. aus Graph) ab. Nicht durch eigene try/catch-Kaskaden umgehen.
- **`location.reload` ist in Tests nicht spionierbar** – Seiten-Reloads über ein InjectionToken
  kapseln (Beispiel: `PAGE_RELOAD` in `pwa-update.service.ts`).
- **Deploy:** `confessio-test` startet erst, wenn Backend-CI und Frontend-CI für denselben
  Commit grün sind und HEAD einen exakten Versionstag trägt (`vX.Y.Z`). Ein Push ohne Tag
  deployt nicht. Postgres (`helm/ai-app-hub-postgres`) wird vor dem Backend ausgerollt. Jede
  GitHub-Environment (`confessio-test`, `confessio-prod`) braucht ein eigenes Secret
  `POSTGRES_PASSWORD` (nur Hex, wird unescaped in `DATABASE_URL` eingesetzt). Die Pipeline seedet
  den Katalog per `--if-empty` nur in eine leere DB.
- **Offen:** `@nestjs/swagger` fehlt noch, obwohl die Rules OpenAPI aus den DTOs verlangen.

## Arbeitsweise

- Antworten an den Nutzer auf **Deutsch**; Code, Bezeichner, Commits auf **Englisch**
  (Conventional Commits). Dokumentation auf Deutsch.
- Keine Secrets in Git oder Logs. Tokens nie in URLs, `localStorage` oder über Frame-Grenzen.
- Vor größeren Umbauten: Bestand zusammenfassen und Vorschlag machen.
- Architekturentscheidungen und Abweichungen von Rules als ADR in
  `docs/ARCHITEKTUR-ENTSCHEIDUNGEN.md` festhalten. Nummern sind stabil und werden im Code zitiert.
- Neue ENV-Variablen immer in `.env.example`, `docker-compose.yml` und dem Helm-Chart ergänzen.

## Wegweiser Rules

| Thema | Rule |
|---|---|
| Stack, Sprache, Grundprinzipien | `00-general.mdc` |
| Browser-Prüfung | `01-browser-tools.mdc` |
| Bausteine/Fachapps, IAM-Grundsätze, Kapselung | `platform-architecture.mdc` |
| IAM-Umsetzung (BFF, Tokens, Policies, Mandanten) | `iam.mdc` |
| SOLID, Tests, Security, Observability | `clean-code.mdc` |
| Angular/Material, Header, Theme | `angular-material.mdc` |
| i18n, LocalizedText | `i18n.mdc` |
| NestJS | `nestjs.mdc` |
| PostgreSQL/Prisma | `postgresql.mdc` |
| Docker | `docker.mdc` |
| Kubernetes, Helm, GitHub Actions, Keycloak-Betrieb | `deployment.mdc` |
| Test-Gates Lokal → CI → Staging → Prod | `testing-pipeline.mdc` |
