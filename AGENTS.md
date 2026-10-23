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
| Keycloak | 26.8, Dev-Realm `axora` aus `infra/keycloak/dev/` (ADR-19) | https://localhost:6057 |
| Mailversand | `../send-mail-with-azure`, SMTP-Eingang für Keycloak (ADR-22) | `127.0.0.1:6004` (SMTP), http://localhost:6003 |
| Mailpit | optionale Mailfalle (`KEYCLOAK_SMTP_HOST=mailpit`) | http://localhost:6060 |
| Axora IAM API | Repo `../axora-platform` (ADR-20) | http://localhost:6061/api/iam/v1/docs |
| IAM-DB | PostgreSQL 16, DB `axora_iam` | `localhost:6062` |

**Lokal anmelden (ADR-19, ADR-20):** `.env` aus `.env.example` anlegen und alle Secrets setzen
(Keycloak, `IAM_KEYCLOAK_CLIENT_SECRET`, `SESSION_TOKEN_KEY`). In `../axora-platform/.env` gehört
derselbe `IAM_KEYCLOAK_CLIENT_SECRET`. Erst den Hub starten, dann `docker compose up -d` in
`axora-platform`; die Plattform hängt sich an das Netz `ai-app-hub_default`. Ohne laufende IAM
endet jeder Login mit `unavailable`. Danach https://localhost:6054 öffnen und mit
`joergbeicht@outlook.de` sowie dem Passwort aus `HUB_DEV_ADMIN_PASSWORD` anmelden. Den 6-stelligen
E-Mail-Code (ADR-21) verschickt `send-mail-with-azure` über Microsoft Graph (ADR-22); der Dienst muss
laufen (`docker compose up -d` in `../send-mail-with-azure`). Kommt nichts an, Logs von
`send-mail-with-azure-smtp` prüfen oder per `.env` auf Mailpit umstellen. Passkeys richtet man unter
https://localhost:6057/realms/axora/account → Kontosicherheit ein; sie ersetzen Passwort und Code. Der Realm wird nur beim ersten Start
importiert. Das Login-Theme liegt in `infra/keycloak/themes/axora/` und wirkt ohne Neustart.
Nach Änderungen an `axora-realm.json` oder den Secrets:
`docker compose rm -sf keycloak && docker volume rm ai-app-hub_keycloak_data && docker compose up -d keycloak`.
Danach die IAM-API neu starten (`docker restart axora-iam-api`), damit der Seed den neuen
Keycloak-Benutzer `joergbeicht@outlook.de` verknüpft. Keycloak läuft aus einem eigenen Image mit der
E-Mail-OTP-Erweiterung (`infra/keycloak/Dockerfile`); bei einem Keycloak-Update den passenden
Erweiterungs-Build mitziehen (ADR-21).

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
- **Neue Backend-Route mit Auth:** `@UseGuards(HubAuthGuard)` verwenden, nie direkt
 `AzureJwtGuard`. `AUTH_MODE` entscheidet, ob dahinter die BFF-Sitzung oder das Entra-Token
 geprüft wird. Im Entra-Modus die Route zusätzlich in `protectedResourceMap` (`msal-config.ts`)
 eintragen, sonst fehlt das Token.
- **`AUTH_MODE` (ADR-19):** Compose nutzt `keycloak`, Helm-Cluster `entra`. Im Keycloak-Modus
 sind Ausweis-/PIN-Login und die Graph-Benutzerverwaltung ausgeblendet.
- **Rechte im Keycloak-Modus (ADR-20):** Kommen aus Axora IAM, nicht aus Token-Rollen. Wer sich
 anmelden darf und was er sieht, wird in der IAM gepflegt (Hub → Einstellungen → Benutzer/Gruppen/
 Rollen). Änderungen wirken nach spätestens 30 s. `Administrator`/`User` werden aus
 `hub.catalog.manage`/`hub.catalog.read` abgeleitet. Neue IAM-Verwaltungsaufrufe laufen über den
 Proxy `/iam/v1/*`, nie direkt vom Browser zur IAM oder zur Keycloak-Admin-API.
- **IAM-Seed** (`axora-platform`): läuft bei jedem Start der IAM-API, ist idempotent und
 verknüpft `joergbeicht@outlook.de` als Admin der Organisation `axora`.
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
