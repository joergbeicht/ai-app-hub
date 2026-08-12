# App Hub

Zentrale Übersicht aller Apps als Cards. Klick auf eine Card öffnet die jeweilige App in einem neuen Browser-Tab.

## Technologie

- **Docker First:** Entwicklung und Laufzeit bevorzugt mit Docker (laut Dev-Rules)
- **Frontend:** Angular (Standalone), Signal First, Material First
- **Backend:** NestJS (`app-hub-backend`), nur für die Rollenverwaltung über Microsoft Graph (siehe ADR-6) – keine eigene DB
- **Theme:** Custom Material Dark Theme (Referenz: ai-berichtgenerator)
- **Port:** 6054 (Frontend), 6055 (Backend)
- **PWA:** Installierbar als Standalone-App (`@angular/service-worker`, Manifest unter `frontend/public/`). Service Worker nur im Production-Build.
- **Konfiguration:** `frontend/src/assets/konfiguration.json`; Einstellungen optional in localStorage

## Start (Docker First – empfohlen)

**Voraussetzung:** SemVer-Git-Tag (z. B. `v1.0.0`). Ohne Tag gibt es keine Versionsnummer und Start/Build brechen mit klarer Fehlermeldung ab – kein Fallback auf `package.json`.

**Entwicklung (Hotreload, HTTPS):**
```bash
# einmalig: brew install mkcert && mkcert -install
./start-docker.sh
```
`start-docker.sh` liest den Git-Tag, legt bei Bedarf lokale TLS-Zertifikate an und startet Docker.  
App: **https://localhost:6054** (PWA-Install-Icon in Chrome wie bei ai-service-intelligence)  
Backend: **https://localhost:6055** (nur nötig für den Settings-Tab „Benutzerverwaltung“, siehe unten).  
Änderungen unter `frontend/` (src, public, angular.json) bzw. `backend/` (src) werden übernommen.

### Tablet-Demo (iPad – Heim-WLAN + iPhone-Hotspot)

Kamera und sichere Kontexte brauchen **HTTPS**. Ablauf wie im Referenzprojekt:

```bash
# Einmalig auf dem Mac
brew install mkcert && mkcert -install

# Stack starten
./start-docker.sh

# Zertifikat für aktuelle Netz-IPs erzeugen (WLAN und/oder Hotspot)
./scripts/setup-ssl.sh
```

| Szenario | Vorgehen |
|----------|----------|
| **Heim-WLAN** | Mac + iPad im gleichen WLAN → `./scripts/setup-ssl.sh` → iPad: `https://<Mac-IP>:6054` |
| **Kundendemo (iPhone-Hotspot)** | Hotspot am iPhone an → Mac verbinden → iPad in denselben Hotspot → `./scripts/setup-ssl.sh` erneut → iPad: die **neue** URL aus der Skript-Ausgabe |

Nach jedem Netzwechsel (WLAN ↔ Hotspot) das Skript neu ausführen — die Mac-IP ändert sich. Die Root-CA muss auf dem iPad nur **einmal** installiert und unter „Zertifikatvertrauenseinstellungen“ aktiviert werden (`mkcert -CAROOT` / AirDrop).

Auf dem iPad: Safari → URL öffnen → Teilen → **Zum Home-Bildschirm** (Standalone-PWA).

**Production (Build + nginx, inkl. PWA/Service Worker):**
```bash
APP_VERSION=$(git describe --tags --abbrev=0 | sed 's/^v//')
docker build -f frontend/Dockerfile frontend \
  --build-arg APP_VERSION="$APP_VERSION" \
  -t app-hub-frontend:latest
docker run -p 6054:80 \
  -e CLUSTER_NAME=axora-confessio-test-aks \
  -e AZURE_TENANT_ID=<tenant-id-des-kunden-clusters> \
  -e AZURE_CLIENT_ID=<client-id-des-kunden-clusters> \
  -e BACKEND_API_URL=<url-des-app-hub-backend-fuer-diesen-cluster> \
  app-hub-frontend:latest
```
`AZURE_TENANT_ID`/`AZURE_CLIENT_ID`/`BACKEND_API_URL` sind **Pflicht** – ohne sie beendet sich der
Container beim Start mit einer klaren Fehlermeldung (siehe „Cluster & Azure-Tenant (Runtime-Config)“
unten).

App: http://localhost:6054  
Installieren: Browser-Menü „App installieren“ / „Zum Home-Bildschirm“ (HTTPS oder localhost). Dev-Hotreload registriert keinen Service Worker.

## Start (lokal, ohne Docker)

```bash
cd frontend
npm install
npm start   # prestart schreibt die Version aus dem Git-Tag
```

App: http://localhost:6054

## Versionsnummer

- **Quelle:** Git-Tag (SemVer), alternativ explizit `APP_VERSION=…`
- **Anzeige:** Header neben „AI APP HUB“ (`frontend/src/app/core/app-version.ts`, generiert)
- **Kein Fake:** `package.json#version` wird nicht als Fallback genutzt
- **Bewusst eine Compile-Konstante** (anders als Cluster/Tenant unten): die Version ist an den
  Code-Stand gebunden, nicht an den Cluster – ein Image = ein fester Versionsstand.

## Cluster & Azure-Tenant (Runtime-Config)

Jeder Kunde bekommt die komplette Plattform auf seinem eigenen Cluster mit seinem eigenen
Azure-Tenant (siehe `platform-architecture.mdc`). Damit **ein** gebautes Docker-Image auf jedem
Kunden-Cluster läuft, ohne pro Kunde neu gebaut zu werden (siehe `deployment.mdc`), stehen
Cluster-Name, Azure-Tenant-ID, Azure-Client-ID und die Backend-URL **nicht** als Compile-Konstanten
im JS-Bundle, sondern in `runtime-config.json`, die erst beim Container-**Start** erzeugt wird:

- **Dev** (`ng serve` lokal oder via Docker Compose): `scripts/write-runtime-config.cjs` schreibt
  `frontend/public/runtime-config.json` aus den ENV-Variablen `CLUSTER_NAME`, `AZURE_TENANT_ID`,
  `AZURE_CLIENT_ID`, `BACKEND_API_URL`. Alle vier sind lokal optional – ohne sie greift ein Fallback
  auf den Confessio-Test-Tenant, „Lokal (Docker Compose)“ und `https://localhost:6055` (keine
  Geheimnisse, siehe `msal-config.ts`).
- **Produktion** (nginx-Image): `docker/docker-entrypoint.d/20-generate-runtime-config.sh` rendert
  `runtime-config.json` aus `public/runtime-config.template.json` per `envsubst`, mit den Werten
  aus dem Helm-Chart des jeweiligen Kunden-Clusters. `AZURE_TENANT_ID`/`AZURE_CLIENT_ID`/
  `BACKEND_API_URL` sind dort **Pflicht** – fehlen sie, bricht der Container-Start sofort mit
  klarer Fehlermeldung ab (kein stiller Fallback auf einen falschen Tenant).
- **Angular** lädt die Datei per `fetch` vor dem Bootstrap (`main.ts` → `core/runtime-config.ts`)
  und stellt sie über den `RUNTIME_CONFIG`-Token bereit – u. a. für die MSAL-Instanz
  (`msalInstanceFactory`), die Cluster-Anzeige im Nutzer-Menü (oberhalb von „Abmelden“) und den
  Backend-Aufruf der Benutzerverwaltung (`UserAdminService`, siehe unten).

## Benutzerverwaltung (Rollen ohne Azure Portal)

Seit ADR-6 gibt es im Settings-Tab „Benutzerverwaltung“ (nur für `Administrator` sichtbar) eine
Liste aller Tenant-Nutzer mit Rollen-Dropdown (`User`/`Administrator`/`Guest`) – kein Azure-Portal-
Zugriff mehr nötig. Technisch:

- **Frontend** ruft `app-hub-backend` (`UserAdminService`) auf, der `MsalInterceptor` hängt
  automatisch ein Access Token für den Backend-Scope an.
- **`app-hub-backend`** (`backend/`, NestJS, Port 6055) validiert das Token selbst
  (`AzureJwtGuard`) und lässt nur `Administrator` durch (`RolesGuard`), dann ruft er **Microsoft
  Graph** im Client-Credentials-Flow auf (eigenes `AZURE_CLIENT_SECRET`, nie im Frontend).

**Einmaliges Setup in Azure (Admin-Task, siehe `backend/.env.example` und ADR-6):**
1. Client-Secret für die App-Registrierung `ai-app-hub` anlegen → `AZURE_CLIENT_SECRET`.
2. Application permissions `User.Read.All`, `Application.Read.All`,
   `AppRoleAssignment.ReadWrite.All` hinzufügen + Admin-Consent geben.
3. „Expose an API“ mit Scope `access_as_user` anlegen (Azure-Vorschlagswert übernehmen).

Lokal in Docker Compose: `AZURE_CLIENT_SECRET` (und optional `AZURE_TENANT_ID`/`AZURE_CLIENT_ID`,
falls abweichend vom Frontend-Dev-Fallback) vor `./start-docker.sh` exportieren. Ohne Secret startet
nur der `backend`-Container nicht (klare Fehlermeldung im Log) – das Frontend läuft unabhängig davon
normal weiter, nur der Tab „Benutzerverwaltung“ bleibt dann leer/mit Fehleranzeige.

## Kunden-Tenant provisionieren (ADR-8)

Für jeden neuen Kunden (siehe ADR-7: ein eigener, isolierter Entra-Tenant pro Kunde) automatisiert
`backend/scripts/provision-customer-tenant.ts` die oben beschriebene einmalige Azure-Einrichtung,
statt sie erneut manuell im Portal zu klicken:

```bash
cd backend
npm run provision:tenant -- \
  --tenant <tenant-id-oder-domain-des-kunden> \
  --frontend-url https://kunde.axora.app \
  --first-admin-upn erste.person@kunde.com   # optional, löst das Bootstrap-Admin-Problem aus ADR-7
```

Fragt interaktiv per Device-Code nach Anmeldung (Global Administrator des **Ziel**-Tenants nötig) und
gibt am Ende `AZURE_TENANT_ID`/`AZURE_CLIENT_ID`/`AZURE_CLIENT_SECRET` aus – einmalig sichtbar, direkt
sicher ablegen (z. B. als Kubernetes-Secret des Kunden-Clusters). Eine bereits bestehende App mit
demselben Namen führt zu einem klaren Abbruch statt einer Dopplung. Weitere Administratoren lassen
sich jederzeit separat zuweisen: `npm run provision:assign-admin -- --tenant <id> --client-id <appId>
--user person@kunde.com`.

**Nicht** Teil dieses Skripts (siehe ADR-7/ADR-8 „Bekannte Grenzen“): Tenant-Erstellung selbst,
Self-Service-Sign-up-Konfiguration, Passkey-Richtlinie, Key-Vault-Provisionierung sowie die
einmalige Einrichtung einzelner Tablet-Benutzer (`employeeId`, PIN, Gruppenmitgliedschaft - siehe
`npm run provision-tablet-credential` weiter unten, ADR-12).

Für einmalige manuelle Tests (z. B. Passkey-Registrierung ausprobieren, siehe ADR-7) legt
`npm run create-test-user -- --tenant <tenant-id> --upn-prefix passkey-test` in `backend/` einen
einzelnen Testbenutzer per Microsoft Graph an (Device-Code-Login, braucht die Rolle
„User Administrator“) – kein Teil der eigentlichen Onboarding-Automatisierung.

## Ausweis-Barcode + PIN-Login für Tablet-Benutzer (ADR-12)

Auf der Login-Seite gibt es neben dem normalen Microsoft-Login einen Umschalter „Mit Ausweis
anmelden“: Die Tablet-Kamera scannt den vorhandenen Mitarbeiterausweis-Barcode
(`@zxing/browser`/`@zxing/library`, `frontend/src/app/features/login/`). Statt danach (wie in der
ursprünglichen ADR-7-Fassung, "Weg A") zu Microsofts Login-Seite mit echtem Passwort
weiterzuleiten, übernimmt `app-hub-backend` seit ADR-12 den kompletten Login selbst:

1. `POST /tablet-auth/login` (`backend/src/tablet-auth/`) prüft Badge-Code → `employeeId` (Graph),
   Mitgliedschaft in der Sicherheitsgruppe `TABLET_USERS_GROUP_ID` und den vom Mitarbeiter
   gewählten 4-stelligen PIN (Hash liegt in Azure Key Vault, siehe `AZURE_KEY_VAULT_URL`).
2. Bei Erfolg tauscht das Backend per **ROPC** das in Key Vault gespeicherte echte, feste
   Entra-Passwort gegen Tokens - das Frontend bekommt dieses Passwort nie zu sehen, nur ein vom
   Backend selbst signiertes, kurzlebiges Session-Token (`TABLET_SESSION_JWT_SECRET`).
3. Zusätzlich stellt das Backend ein 1 Jahr gültiges Device-Token aus, das das Frontend lokal
   (pro Badge-Code) ablegt - beim nächsten Scan an diesem Tablet (`POST /tablet-auth/renew`)
   entfällt die PIN-Eingabe dadurch meist komplett.

Einzelnen Tablet-Benutzer einrichten (setzt festes Entra-Passwort, Gruppenmitgliedschaft und
Key-Vault-Secret in einem Schritt):

```bash
cd backend
npm run provision-tablet-credential -- \
  --tenant <tenant-id-oder-domain> --key-vault-url https://<vault>.vault.azure.net \
  --upn tablet-user@kunde.com --badge-code TABLET-001 --group-id <object-id-der-Tablet-Gruppe>
```

Details/Trade-offs (ROPC + Conditional Access, Key-Vault-Speicherkonzept, Widerrufsliste): siehe
ADR-12 in `docs/ARCHITEKTUR-ENTSCHEIDUNGEN.md`. Der normale PC-Login (MSAL-Redirect mit echtem
Passwort/MFA, ADR-6/ADR-7) ist davon unberührt.

## Struktur

- **Startseite:** Card-Grid mit allen konfigurierten Apps (responsive, Mobile First)
- **Einstellungen:** Apps bearbeiten, hinzufügen, entfernen; Speichern in localStorage; „Auf Standard zurücksetzen“ lädt wieder `konfiguration.json`
- **Card:** App-Icon (Bild oder Material-Icon), Name, Beschreibung, URL; Klick → `window.open(url, '_blank')`
- **Icons:** `iconType: "image"` mit Pfad (z. B. `app-icons/xyz.svg`) oder `iconType: "mat-icon"` mit Icon-Namen; bei Fehler wird das Default-Icon (`defaultIcon` in Config) angezeigt

## Konfiguration

Siehe `frontend/src/assets/konfiguration.json` und `docs/IMPLEMENTIERUNG-CHECKLISTE.md`.

## i18n

UI-Texte laufen über [Transloco](https://jsverse.gitbook.io/transloco), pro
Feature ein Übersetzungs-Scope unter `frontend/src/assets/i18n/<scope>/`.
Standard-/aktive Sprache ist Deutsch (`de`), `en` liegt für einen späteren
Sprachumschalter bereits vollständig übersetzt vor.

## Qualitätssicherung

```bash
cd frontend
npm run lint          # ESLint (TS + Angular-Templates)
npm run format:check  # Prettier
npm test              # Karma/Jasmine im Watch-Modus
npm run test:ci        # Karma/Jasmine headless (CI)
npm run build          # Production-Build
```

```bash
cd backend
npm run lint          # ESLint
npm run format:check  # Prettier
npm test              # Jest
npm run build          # tsc via nest build
```

Ein Git-Pre-Commit-Hook (Husky + lint-staged) lintet/formatiert geänderte
Dateien automatisch. Einmalig aktivieren nach dem Klonen:

```bash
cd frontend
npm install
```

Die GitHub-Actions-Pipelines (`.github/workflows/frontend-ci.yml`,
`.github/workflows/backend-ci.yml`) führen Lint, Unit-Tests und Build bei
jedem Push/PR auf `frontend/**` bzw. `backend/**` aus.

## Architektur-Entscheidungen

Bewusste, dokumentierte Abweichungen von den Standard-Rules (kein eigenes
Backend/DB, kein AKS-Deployment) siehe `docs/ARCHITEKTUR-ENTSCHEIDUNGEN.md`.

## Login

Anmeldung über **Azure Entra ID** (Microsoft-Konto, MSAL Redirect-Flow) –
siehe ADR-2. In Azure ist aktuell nur `http://localhost:6054` als
Redirect-URI registriert; die HTTPS-Dev-/LAN-URLs der Tablet-Demo oben
funktionieren beim Login erst, sobald das Azure-Team dort weitere
Redirect-URIs ergänzt hat.
