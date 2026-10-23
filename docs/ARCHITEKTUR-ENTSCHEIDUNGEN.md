# Architektur-Entscheidungen (ADRs) – AI App Hub

Dieses Dokument hält bewusste Abweichungen von den Standard-Rules
(`.cursor/rules/*.mdc`) fest, die für dieses Projekt aktuell explizit so
entschieden wurden. Ziel: Nachvollziehbarkeit statt stillschweigender
Abweichung – siehe `platform-architecture.mdc` ("Ausnahmen ... nur zulässig,
wenn explizit im jeweiligen Projekt so entschieden und dokumentiert").

ADR-Nummern sind stabil und werden im Code zitiert (`siehe ADR-12`) – nie
umnummerieren, überholte ADRs nicht löschen, sondern im Status markieren.
Die im IAM-Konzept geplanten Plattform-ADRs (`ADR-001` … `ADR-005`, Phase 0)
gehören in das künftige Plattform-Repository (`axora-platform/docs/adr/`),
nicht in diese Datei.

## Statusübersicht (Stand 23.10.2026)

Seit ADR-18 ist `docs/konzepte/axora-iam-konzept-v1.0.md` das verbindliche
Zielbild für Identität, SSO und Berechtigungen. **„Bestand, Ziel abgelöst“**
heißt: Der Code läuft so weiter, bis die Migration auf Keycloak/Axora IAM
erfolgt ist. Er wird aber nicht mehr funktional ausgebaut.

| ADR | Thema | Status |
|---|---|---|
| ADR-1 | Kein eigenes Backend/keine DB | überholt durch ADR-6 und ADR-17 |
| ADR-2 | Entra ID / MSAL im Frontend | Bestand, Ziel abgelöst durch ADR-18 (BFF + Keycloak) |
| ADR-3 | CI nur Lint/Test/Build | überholt durch ADR-10 (Deployment per GitHub Actions + Helm) |
| ADR-4 | LocalizedText in `konfiguration.json` | LocalizedText gilt; Speicherort überholt durch ADR-17 (DB) |
| ADR-5 | PWA via Angular Service Worker | gilt (ergänzt durch ADR-13, ADR-15) |
| ADR-6 | Rollenverwaltung über Microsoft Graph | Bestand, Ziel abgelöst durch ADR-18 (Axora IAM) |
| ADR-7 | Self-Service-Sign-up (Entra External ID) | Bestand, Ziel abgelöst durch ADR-18 (Einladung/Gast über Keycloak + IAM) |
| ADR-8 | Tenant-Provisionierung per Graph | Bestand, Ziel abgelöst durch ADR-18 (Keycloak Config-as-Code) |
| ADR-9 | Cluster pro Kunde, keine Mandantenfähigkeit | gilt für Infrastruktur; IAM-Mandantenmodell offen (IAM-Konzept §4, offene ADR 1) |
| ADR-10 | Helm-Deployment `confessio-test` | gilt |
| ADR-11 | Öffentlicher Ingress + cert-manager | gilt |
| ADR-12 | PIN + ROPC für Tablet-Benutzer | Bestand, **widerspricht IAM-Konzept** (ROPC verboten) – Ablösung vor B2B-Go-Live |
| ADR-13 | `version.json` + `activateUpdate()` | gilt |
| ADR-14 | Silent-SSO per `ssoSilent()` | Bestand, Ziel abgelöst durch ADR-18 (Top-Level-Redirect, kein iframe-Login) |
| ADR-15 | `navigationUrls`-Allowlist | gilt |
| ADR-16 | Retry für `runtime-config.json` | gilt |
| ADR-17 | Zentraler App-Katalog in PostgreSQL | gilt |
| ADR-18 | IAM-Konzept v1.0 als Zielbild | gilt |
| ADR-19 | Keycloak-Login über Backend-BFF (`AUTH_MODE`) | gilt lokal; Cluster bleiben vorerst `entra` |

## ADR-1: Kein eigenes PostgreSQL-DB, `app-hub-backend` nur für Rollenverwaltung (Stand: seit ADR-6 teilweise überholt)

**Kontext:** `platform-architecture.mdc` fordert für jede Fachapplikation
volle Architektur (eigenes Backend, eigene DB für Nutzer-Präferenzen,
Favoriten, Berechtigungen).

**Entscheidung (ursprünglich, MVP):** Der App Hub war ein reiner
Angular-Client ohne eigenes Backend. Die Konfiguration
(`konfiguration.json`) liegt als statisches Asset vor, Nutzeränderungen
werden per `ConfigService` weiterhin in `localStorage` persistiert (siehe
`docs/archiv/IMPLEMENTIERUNG-CHECKLISTE.md`, Optionen A/B wurden bewusst gewählt,
Option C – eigenes Backend – wurde zurückgestellt).

**Update:** Mit ADR-6 gibt es jetzt ein `app-hub-backend` (NestJS) – aber
bewusst **nur** für die App-Rollenverwaltung über Microsoft Graph, **keine
eigene PostgreSQL-DB**. Rollen-Zuweisungen leben in Azure AD selbst
(Microsoft Graph als "Source of Truth"), eine zusätzliche DB dafür wäre
reine Datenduplizierung ohne Mehrwert (YAGNI, siehe `clean-code.mdc`).
App-Konfiguration/Favoriten bleiben weiterhin `localStorage`-basiert.

**Konsequenz / Trade-off:** Hub-Einstellungen (Sprache, App-Liste) sind
weiterhin pro Browser/Gerät lokal, nicht geräteübergreifend synchronisiert.
Rollen sind dagegen jetzt zentral in Azure AD und damit bereits
mehrbenutzer-/geräteübergreifend korrekt (kein `localStorage`-Bezug).

**Nächster Schritt (wenn benötigt):** Sobald echte Nutzer-Präferenzen/
Favoriten geräteübergreifend gebraucht werden, `app-hub-backend` um ein
PostgreSQL-Modul erweitern (eigenes Modul, nicht das Rollen-Modul
verschmutzen) und Frontend von `localStorage` auf Backend-API umstellen.
Bis dahin: bewusste, dokumentierte Abweichung, kein impliziter Standardweg
für andere Projekte.

## ADR-2: Azure Entra ID / MSAL statt Login-Fake (Stand: MVP, Frontend-Login umgesetzt)

> **Status (23.10.2026):** Bestand, Ziel abgelöst durch ADR-18. Künftig
> BFF mit Authorization Code + PKCE gegen Keycloak, Tokens nur serverseitig,
> Browser nur mit HttpOnly-Session-Cookie. Entra ID bleibt als optionaler
> externer IdP eines Kunden (Föderation über Keycloak) erhalten.

**Kontext:** `platform-architecture.mdc` fordert einen zentralen Identity
Provider (OIDC/SSO) mit JWT-Validierung und Silent-SSO. Plattformweite
Festlegung: **Microsoft Entra ID** (intern/Tests) bzw. später
**Entra External ID** (CIAM für Endkunden) – nicht Keycloak oder ein
anderer selbst betriebener IdP. Frontend-Anbindung über **MSAL**.

**Entscheidung:** `AuthService` (`core/services/auth.service.ts`) kapselt
`@azure/msal-angular`/`@azure/msal-browser` (Redirect-Flow, App-Registrierung
`ai-app-hub`). `authGuard` prüft echte MSAL-Konten statt eines Fake-Zustands
und ist jetzt per Default-Deny (`canActivateChild` auf einer schützenden
Parent-Route in `app.routes.ts`) auf alle Routen außer `/login` angewendet –
neue Routen sind automatisch geschützt. Die frühere Demo-Nutzerliste
(`DEMO_USERS`) wurde entfernt.

Tenant-ID/Client-ID stehen **nicht** als Compile-Konstanten in
`msal-config.ts`, sondern kommen zur Laufzeit aus `RUNTIME_CONFIG`
(`core/runtime-config.ts`, siehe README „Cluster & Azure-Tenant“): jeder
Kunde bekommt seinen eigenen Azure-Tenant, das gebaute Docker-Image darf
dafür laut `deployment.mdc` nicht neu gebaut werden müssen. Der
Confessio-Test-Tenant (`ConfessioManagement.onmicrosoft.com`) ist nur noch
der lokale Dev-Fallback in `scripts/write-runtime-config.cjs`, kein
Compile-Wert mehr.

**Konsequenz:** Login läuft über echte Azure-Anmeldedaten, Rolle im
Header stammt aus dem `roles`-Claim des ID-Tokens (App Roles `User`,
`Administrator`, `Guest`), Standard-Fallback `Guest`, solange in Azure
niemandem eine Rolle zugewiesen ist (Zuweisung läuft seit ADR-6 über die
Hub-eigene Benutzerverwaltung, nicht mehr nur über das Azure Portal). Es
gibt weiterhin **kein** Silent-SSO zu eingebetteten Baustein-Frontends (Hub
bindet aktuell keine Bausteine per iFrame ein). Backend-seitige
Token-Validierung gibt es seit ADR-6 für das `app-hub-backend`
(`AzureJwtGuard`) – das Backend vertraut dem Frontend nicht "blind".

**Bekannte offene Punkte auf Azure-Seite (nicht im Frontend-Code lösbar):**
- Registrierte Redirect-URI ist bisher nur `http://localhost:6054`. HTTPS-
  Dev/LAN-URLs (siehe iPad-Demo, `scripts/setup-ssl.sh`) sind nicht
  registriert – Login schlägt dort mit `AADSTS50011` fehl, bis weitere
  Redirect-URIs in der App-Registrierung ergänzt werden. `redirectUri`/
  `postLogoutRedirectUri` sind im Code bewusst dynamisch (`window.location.origin`),
  damit nach einer Azure-seitigen Ergänzung keine Code-Änderung mehr nötig ist.
- App Roles sind angelegt, aber niemandem zugewiesen (Entra ID →
  Enterprise-Anwendungen → ai-app-hub → Benutzer und Gruppen).
- Sign-in-Audience ist `AzureADMyOrg` (nur interner Tenant) – Umstellung
  auf Entra External ID folgt erst mit dem ersten externen Kunden.

Keycloak oder der hauseigene `authenticator` sind **kein** Standardweg für
dieses Projekt (Authenticator nur als dokumentierte Ausnahme bei strikter
Deutschland-only-Datenresidenz für Identitätsdaten – siehe
`platform-architecture.mdc`).

## ADR-3: CI/CD nur als Frontend-/Backend-Pipelines (Lint/Test/Build), kein Deployment nach AKS

**Kontext:** `deployment.mdc` / `testing-pipeline.mdc` fordern eine
4-Stufen-Gate-Pipeline bis Produktion (Azure Kubernetes Service, Helm,
automatisierte Rollbacks, Prod-Smoke-Tests).

**Entscheidung:** `.github/workflows/frontend-ci.yml` und (seit ADR-6)
`.github/workflows/backend-ci.yml` decken aktuell nur Lint → Unit-Tests →
Build ab. Es existiert kein AKS-Cluster, keine ACR und keine Secrets für
dieses Projekt – ein vollständiges Deployment-Gate würde nicht-
funktionierende Infrastruktur vortäuschen.

Beide `build`-Jobs bauen zusätzlich das jeweilige Produktions-Docker-Image
(`docker build -f frontend/Dockerfile` bzw. `-f backend/Dockerfile`),
scannen es mit Trivy auf Critical/High-CVEs (`deployment.mdc`) und prüfen
am laufenden Container das Fail-Fast-Verhalten ohne
`AZURE_TENANT_ID`/`AZURE_CLIENT_ID`(`/AZURE_CLIENT_SECRET` beim Backend)
(siehe ADR-2/ADR-6) sowie beim Frontend zusätzlich, dass
`runtime-config.json` korrekt aus ENV-Variablen erzeugt wird –
**nur Build-Validierung, kein Push in eine Registry, kein Deploy**, also
weiterhin kein Widerspruch zu "kein Deployment-Gate" oben.
`RUN apk upgrade` in den jeweiligen Alpine-Stages hält die Basispakete
aktuell, damit der Scan nicht auf längst behobenen Basis-Image-CVEs
blockiert. Dependency-Updates (npm für Frontend/Backend, GitHub Actions,
Docker-Basisimages) laufen über `.github/dependabot.yml`
(`clean-code.mdc`: Dependency-Scanning).

**Konsequenz:** Releases erfolgen aktuell manuell (Docker-Image bauen,
`Dockerfile` + `nginx.conf` sind dafür vorbereitet und werden in der CI
gebaut/validiert, aber nicht gepusht oder deployed).

**Nächster Schritt (wenn benötigt):** Sobald AKS/ACR-Zugang und Secrets für
den App Hub bereitstehen, `deployment.mdc`-Pipeline (Staging → Tests →
Prod → Smoke-Test → ggf. Rollback) ergänzen, analog zu anderen
Fachapplikationen im Portfolio.

## ADR-4: App-Katalog-Texte als LocalizedText in `konfiguration.json`

**Kontext:** UI-Labels laufen über Transloco (`assets/i18n/...`). Name und
Beschreibung der Hub-Apps sind jedoch fachliche Kataloginhalte und werden
in Settings bearbeitet sowie in `localStorage` persistiert – sie gehören
nicht in die UI-Übersetzungsdateien.

**Entscheidung:** `AppEntry.name` / `AppEntry.description` sind
`LocalizedText`-Maps über alle `APP_LOCALES` (aktuell `de`/`en`/`es`/`fr`/
`tr`/`it`). Anzeige und Settings-Formular nutzen die aktive Locale; leere
Locale-Slots werden beim Laden aus dem Asset nachgezogen (Legacy: früherer
Plain-String = nur `de`).

**Konsequenz:** Katalog-Übersetzungen werden mit der Config gepflegt;
Sprachwechsel ändert Labels und App-Texte. Nutzeredits pro Sprache bleiben
lokal im Browser.

## ADR-5: PWA via `@angular/service-worker` (ohne Backend-Version-Fallback)

**Kontext:** Referenz `ai-service-intelligence` nutzt Manifest, Icons,
`ngsw-config.json`, `provideServiceWorker` (nur Production) und
`SwUpdate` inkl. Fallback gegen `GET /api/version`.

**Entscheidung:** Derselbe Client-PWA-Stack für den App Hub
(`public/manifest.webmanifest`, Icons, Nginx-Cache-Header für
`index.html`/`ngsw*`, `PwaUpdateService`). **Kein** `/api/version`-Fallback,
weil der Hub im MVP kein Backend hat (ADR-1). Updates laufen über den
Angular Service Worker (`VERSION_READY` → activate + Reload).

**Konsequenz:** Installierbar als Standalone-PWA (HTTPS bzw. localhost).
Service Worker ist in Dev (`ng serve`) deaktiviert – Install/Update-Tests
brauchen einen Production-Build (z. B. Prod-Dockerfile).

## ADR-6: In-App-Rollenverwaltung über `app-hub-backend` + Microsoft Graph (statt Azure Portal)

> **Status (23.10.2026):** Bestand, Ziel abgelöst durch ADR-18. Rollen,
> Gruppen und Rechte verwaltet künftig Axora IAM (`/api/iam/v1`); der App
> Hub wird dessen Admin-Frontend (IAM-Konzept §15). Microsoft Graph ist
> dann nur noch Quelle für Kunden-Föderation/SCIM, nicht mehr
> Rollenspeicher.

**Kontext:** Rollen-Zuweisung lief bisher ausschließlich über das Azure
Portal (Entra ID → Enterprise-Anwendungen → ai-app-hub → Benutzer und
Gruppen, siehe ADR-2) – das setzt Azure-Admin-Kenntnisse voraus, die ein
normaler Axora-Kunden-Admin nicht haben will/soll. `platform-architecture.mdc`
sieht für den Hub als Fachapplikation ohnehin ein eigenes Backend für
"Berechtigungen je Fachapplikation" vor (siehe ADR-1).

**Entscheidung:** Neues `app-hub-backend` (NestJS, Port 6055), **nur** für
diese eine Aufgabe (schmal geschnitten, YAGNI – keine Präferenzen/
Favoriten, keine eigene DB, siehe ADR-1-Update):

- `GraphService` (`src/graph/graph.service.ts`) ruft Microsoft Graph im
  **Client-Credentials-Flow** (App-only, `.default`-Scope) auf – niemals im
  Browser, weil die dafür nötigen Application-Permissions
  (`User.Read.All`, `Application.Read.All`, `AppRoleAssignment.ReadWrite.All`,
  alle mit Admin-Consent) zu privilegiert für ein SPA-Frontend sind.
- `UsersController`/`UsersService` (`GET /users`, `PATCH /users/:id/role`)
  bilden Graph-Nutzer + App-Role-Assignments auf `{ id, displayName, email,
  role }` ab; Rollenwechsel = bestehende Zuweisung(en) löschen + neue
  anlegen (Graph kennt kein "Update"). Rolle `Guest` = keine Zuweisung.
- `AzureJwtGuard` validiert jedes eingehende Access Token selbst (Signatur
  via Azure-AD-JWKS, Issuer, Audience ∈ {Client-ID, `api://<Client-ID>`} –
  Azure setzt bei einem eigenen "Expose an API"-Scope die App-ID-URI als
  `aud`, nicht die rohe Client-ID –, Expiry) – kein Trust nur weil MSAL das
  Token im Frontend schon geprüft hat (`platform-architecture.mdc`).
  `RolesGuard`/`@Roles('Administrator')` lässt nur Administratoren durch.
- Frontend: neuer, nur für `Administrator` sichtbarer Settings-Tab
  "Benutzerverwaltung" (`settings-page.component.ts` → `isAdmin` +
  `UserManagementComponent`), ruft `UserAdminService` → `app-hub-backend`.
  Der `MsalInterceptor` hängt automatisch ein Access Token für den
  Backend-API-Scope an (`protectedResourceMap` in `msal-config.ts`).
- `RUNTIME_CONFIG` (siehe README „Cluster & Azure-Tenant“) um
  `backendApiUrl` erweitert – die Backend-URL ist pro Kunden-Cluster
  unterschiedlich, genau wie Tenant-/Client-ID.

**Konsequenz / Trade-off:** Ein Axora-Administrator verwaltet Rollen
zukünftig komplett in der Hub-UI, ohne je das Azure Portal zu öffnen. Die
Sicherheitsprüfung liegt jetzt im Backend (`RolesGuard`), nicht mehr nur
implizit beim Azure-Portal-Zugriff – striktere, nachvollziehbarere
Kontrolle. Kosten: ein zusätzlicher Service (`app-hub-backend`) mit eigenem
Lifecycle/Deployment/CI (`backend-ci.yml`).

**Bekannte offene Punkte auf Azure-Seite (einmalig, nicht im Code lösbar,
siehe `.env.example` im Backend):**
- Ein **Client-Secret** für die bestehende App-Registrierung `ai-app-hub`
  muss angelegt und als `AZURE_CLIENT_SECRET` (nur Backend, nie im
  Frontend-Bundle, echtes Geheimnis – anders als Tenant-/Client-ID) an das
  Backend-Deployment übergeben werden.
- **Application permissions** `User.Read.All`, `Application.Read.All`,
  `AppRoleAssignment.ReadWrite.All` müssen der App-Registrierung
  hinzugefügt und per **Admin-Consent** freigegeben werden (Entra ID →
  App-Registrierungen → ai-app-hub → API-Berechtigungen).
- Die App-Registrierung braucht zusätzlich **"Expose an API"** mit einem
  Scope namens exakt `access_as_user` (Azure-Vorschlagswert beim Anlegen
  übernehmen) – sonst schlägt der Silent-Token-Acquire für
  Backend-Aufrufe im Frontend fehl (`msal-config.ts` erwartet
  `api://<client-id>/access_as_user`).
- Einmal erledigt, ist **kein** weiterer Azure-Portal-Besuch für
  Rollenzuweisungen mehr nötig – das war genau das Ziel dieser ADR.

## ADR-7: Mitarbeiter-Onboarding je Kunden-Tenant über Self-Service-Sign-up (Entra External ID), keine Admin-Anlage/ERP-Sync

> **Status (23.10.2026):** Bestand, Ziel abgelöst durch ADR-18. Onboarding
> läuft künftig über Axora-IAM-Einladungen, Kunden-IdP-Föderation/SCIM über
> Keycloak bzw. Gastkonten (IAM-Konzept §10–12). Keine Kontoverknüpfung
> allein über die E-Mail-Adresse.

**Kontext:** Zielbild der Plattform: Axora-Apps werden über die Homepage per
1-Klick verkauft, pro Kunde entsteht ein eigener, isolierter
Kubernetes-Cluster (von Confessio betrieben), inkl. eines Test→Prod-
Transports. Jeder Kunde hat n eigene Mitarbeiter, die sich am Hub anmelden
müssen – **alle Kunden-Cluster sind komplett voneinander getrennt**, auch bei
den Identitätsdaten. Damit ist jeder Kunde ein "echter Endkunde" im Sinne von
`platform-architecture.mdc` ("Echte Endkunden: Microsoft Entra External ID
(CIAM), sobald der erste externe Kunde ansteht") – nicht mehr nur der interne
Confessio-Test-Tenant aus ADR-2.

**Entscheidung:**
- Pro Kunden-Cluster genau ein eigener **Entra External ID (CIAM)-Tenant** –
  volle Isolation der Mitarbeiter-Identitäten zwischen Kunden (kein
  gemeinsamer CIAM-Tenant für mehrere Kunden), analog zur bestehenden
  1-Tenant-pro-Kunde-Konvention aus ADR-2/`RUNTIME_CONFIG`.
- Mitarbeiter eines Kunden bekommen ihr Konto **nicht** durch einen Admin
  oder eine Backend-Funktion angelegt, sondern per **Self-Service-Sign-up**
  von Entra External ID (Registrierungs-/Einladungslink, den der
  Kunden-Admin an seine Mitarbeiter verteilt). Das ist reine
  Azure-Konfiguration (User-Flow im jeweiligen External-ID-Tenant), **kein**
  Code in `app-hub-backend`/Frontend.
- Neu registrierte Mitarbeiter erscheinen automatisch über Microsoft Graph
  in der **bereits bestehenden** Benutzerverwaltung (ADR-6, `GET /users`)
  mit Default-Rolle `Guest`. Ein Kunden-Admin stuft sie dort auf
  `User`/`Administrator` hoch – kein neuer Code nötig, die Rollenverwaltung
  deckt das bereits vollständig ab.
- Explizit **nicht** gewählt (Stand heute): Admin-getriebene Anlage
  einzelner Konten (Graph `POST /users` / Bulk-CSV-Import) und laufende
  ERP-Synchronisation. Beides bedeutet zusätzlichen Code + Betriebsaufwand,
  ohne dass über Self-Signup hinaus aktuell ein Bedarf erkennbar ist
  (YAGNI, siehe `clean-code.mdc`). Beide Optionen sind reversibel/ergänzbar,
  falls ein Kunde später doch eine ERP-Anbindung braucht.

**Konsequenz / Trade-off:** Kein zusätzlicher Code für die Nutzeranlage –
Mitarbeiter erledigen die Kontoerstellung selbst, ein Admin muss nur noch
Rollen vergeben (bereits vorhanden, siehe ADR-6). Kosten: Confessio muss pro
neuem Kunden-Cluster einen neuen Entra-External-ID-Tenant provisionieren und
dessen Sign-up-User-Flow konfigurieren – das ist Teil des noch zu bauenden
Kunden-Onboarding-Automatismus (1-Klick-Verkauf → Cluster- +
Tenant-Provisionierung), **nicht** Teil dieser ADR.

**Offenes Henne-Ei-Problem (noch zu lösen, bevor das erste Self-Signup live
geht):** Der allererste Mitarbeiter eines neuen Kunden-Tenants landet nach
dem Sign-up ebenfalls nur als `Guest` – aber es gibt noch **keinen**
Administrator, der ihn befördern könnte (`RolesGuard` lässt in
`UsersController` nur `Administrator` an `PATCH /users/:id/role`). Ohne
Lösung kann sich in einem frisch provisionierten Kunden-Tenant niemand
selbst zum Administrator machen. Mögliche Lösungen (noch nicht entschieden):
den Käufer beim Kauf-/Provisionierungs-Vorgang automatisch per Graph als
ersten Administrator zuweisen, oder ein einmaliger "Bootstrap-Admin"-Schritt
als Teil der Cluster-Provisionierung.

**Anmeldemethode für Mitarbeiter mit geringer technischer Affinität (z. B.
Werkstattpersonal): Passkey/WebAuthn + Passwort, explizit kein QR-Code-Badge,
explizit kein selbstgebauter `authenticator`.** Hintergrund: Für Mitarbeiter,
denen eine MFA-Code-Suche in Outlook nicht zumutbar ist, wurden zwei
Alternativen diskutiert und wieder verworfen:

- *QR-Code-Badge-Anmeldung* (Entra-ID-Funktion "QR code + PIN", siehe
  [Microsoft Learn](https://learn.microsoft.com/en-us/entra/identity/authentication/how-to-authentication-qr-code)):
  wieder verworfen, weil diese Funktion für **M365-lizenzierte
  Workforce-Tenants** dokumentiert ist (Lizenzpflicht: Entra ID P1/P2, M365
  F1/F3/E3/E5, EMS E3/E5 oder O365 F3 **pro aktiviertem Mitarbeiter**) – nicht
  für Entra External ID (CIAM)-Tenants, die dieses Projekt laut ADR-7 pro
  Kunde nutzt. Zusätzliche Pro-Kopf-Lizenzkosten pro Kunde passen nicht zum
  MAU-basierten CIAM-Geschäftsmodell.
- *Eigener `authenticator` statt Entra External ID*: ebenfalls verworfen.
  `platform-architecture.mdc` erlaubt `authenticator` nur als dokumentierte
  Ausnahme bei strikter Deutschland-only-Datenresidenz, nicht als
  allgemeinen Ersatz für Entra ID. Ein selbstgebauter IdP würde die
  Lizenzkosten zwar vermeiden, aber dauerhaften Eigenbetrieb von
  Passwort-Hashing, MFA, Session-Management, Anomalie-/Brute-Force-Schutz,
  DSGVO-Auskunftsprozessen und Sicherheits-Audits erfordern – für n viele
  Kunden-Cluster ein deutlich größeres, wiederkehrendes Risiko/Aufwand als
  die eigentlich vermiedenen Lizenzkosten. Zusätzlich verliert man das
  Vertrauens-/Compliance-Signal "Login läuft über Microsoft Entra ID" bei
  der Sicherheits-Due-Diligence künftiger Enterprise-Kunden.

**Tatsächliche Entscheidung:** **Passkey/WebAuthn** (Face ID/Fingerabdruck)
mit **Passwort als Fallback** – beides ist im **Entra-External-ID-Kernangebot
enthalten, ohne Zusatzkosten pro Mitarbeiter** (siehe
[External ID Pricing](https://learn.microsoft.com/en-us/entra/external-id/external-identities-pricing)).
Löst dieselbe Anforderung (kein Passwort-Tippen/Code-Suchen im Alltag) wie
die QR-Code-Idee, ohne deren Lizenzkosten oder das Risiko eines
selbstgebauten IdP.

**Kosten-Fakten Entra External ID (Stand der Recherche, siehe Quellen oben):**
- Kernangebot **kostenlos für die ersten 50.000 Monthly Active Users (MAU)
  pro Monat** – MAUs werden dabei über **alle Tenants summiert, die an
  dasselbe Azure-Abonnement gebunden sind** (nicht 50.000 kostenlos pro
  Kunde, sondern kombiniert über alle Kunden-Tenants unter Confessios
  Abonnement).
- Darüber hinaus MAU-basierte Abrechnung – konkrete aktuelle Preise pro
  zusätzlichem MAU waren zum Zeitpunkt der Recherche in Microsofts
  Preistabellen nicht öffentlich einsehbar (Platzhalter statt Beträgen) und
  sollten vor einer verbindlichen Kunden-Preiskalkulation erneut geprüft
  werden.
- Premium-Add-ons (SMS-Authentifizierung, Identity Governance – **und
  vermutlich auch QR-Code+PIN**, siehe oben) haben **keine** Freigrenze und
  sind bewusst nicht Teil dieser Entscheidung.

**Nächster Schritt (wenn benötigt):** Passkey/WebAuthn-Anmeldung im
bestehenden Confessio-Test-Tenant hands-on verifizieren (Registrierung eines
Passkeys, Sign-in-Flow über `login.microsoftonline.com` mit unserem
bestehenden MSAL-Setup) – analog zum ursprünglich für QR-Code geplanten
Piloten, nur mit der jetzt korrekten Methode.

**Ergänzung: Tablets werden von mehreren Mitarbeitern geteilt (kein
1:1-Gerät, kein privates Smartphone pro Mitarbeiter).** Das schließt
"Cross-Device"-Passkeys (Scan mit dem eigenen Smartphone) als Regelfall aus.
Geprüfte Alternativen und Entscheidung:

- *Ein geteiltes Azure-AD-Konto + Mitarbeiter-Identifikation nur auf
  App-Ebene (PIN/Badge im `app-hub-backend`)*: verworfen. Würde eine eigene,
  parallele Identitäts-/Audit-Logik neben Entra ID bedeuten – Entra IDs
  Audit-Trail zeigt dann nur das eine geteilte Gerätekonto, nicht den
  einzelnen Mitarbeiter. Widerspricht dem Prinzip "eine Identität pro
  Mitarbeiter" aus ADR-6/ADR-7.
- *QR-Code+PIN (siehe oben) trotz Lizenzkosten*: nicht gewählt, da Option
  unten dieselbe Anforderung (geteiltes Gerät, kein Smartphone, kein
  Passwort-Tippen) ohne Zusatzlizenz pro Mitarbeiter löst.

**Zwischenzeitlich geprüft und wieder verworfen (chronologisch):**
1. *Shared-Device-Modus des Betriebssystems* (iPadOS "Shared iPad"/Android
   Enterprise Multi-User) *mit gerätegebundenem Passkey pro Profil*:
   verworfen, weil das zwingend ein MDM voraussetzt – **kein Kunde betreibt
   ein MDM, und ein MDM ist für die Axora-Tablet-Apps nicht notwendig**
   (explizite Entscheidung).
2. *Roaming FIDO2-Sicherheitsschlüssel im neuen Mitarbeiterausweis-Format*
   (Kreditkartenformat, z. B. Neowave Badgeo, Cryptnox): technisch
   funktionsfähig (kein MDM nötig, siehe Hands-on-Test unten), aber
   **verworfen, weil sie neue Ausweise voraussetzt** – Kunden wie GERIMA
   haben aber bereits echte, im Alltag genutzte Mitarbeiterausweise mit
   Barcode (z. B. für Zeiterfassung/Zugang). Diese sollen weiterverwendet
   werden, statt neue Hardware einzuführen.

**Tatsächliche Entscheidung: vorhandene Barcode-Mitarbeiterkarte scannen
zur Identifikation, festes (Entra-konformes) Passwort zur Authentifizierung
– kein neues Gerät, keine neue Karte, kein MDM.**

Wichtige technische Einschränkung, die diese Entscheidung prägt: Ein
**Barcode ist nur ein aufgedrucktes Muster ohne kryptografisches Geheimnis**
– beliebig kopierbar, kann also nicht selbst das Login-Geheimnis sein.
Zusätzlich gilt für Entra ID/Entra External ID **eine feste, nicht
konfigurierbare Passwortrichtlinie** (mind. 8 Zeichen, 3 von 4
Zeichenkategorien) – eine kurze Zahlen-PIN als Entra-Passwort ist technisch
nicht möglich. Deshalb übernimmt der Barcode nur die **Identifikation**
("wer meldet sich an"), ein normales, aber **festes und selbst gewähltes**
Passwort (informell "PIN" genannt, mind. 8 Zeichen, keine Ablaufpflicht)
übernimmt die **Authentifizierung**:

1. Mitarbeiter hält die vorhandene Ausweiskarte vor die Tablet-Kamera
   (Barcode-Scan direkt im Frontend, z. B. via `@zxing/library` – keine
   zusätzliche Hardware, kein externer Scanner nötig, funktioniert mit
   jeder Tablet-Kamera).
2. `app-hub-backend` löst den gescannten Barcode-Wert über Microsoft Graph
   gegen das Attribut **`employeeId`** des Entra-Benutzerobjekts auf
   (`GET /users?$filter=employeeId eq '...'`, bestehende Berechtigung
   `User.Read.All` aus ADR-6 reicht aus, keine neue Graph-Berechtigung
   nötig) und gibt den zugehörigen UPN zurück.
3. Frontend startet `msalService.loginRedirect({ loginHint: upn, ... })` –
   die Microsoft-gehostete Login-Seite überspringt dadurch die
   Benutzername-Eingabe und zeigt direkt das Passwortfeld.
4. Mitarbeiter tippt sein **eigenes, festes Passwort**. Danach normaler,
   vollwertiger Entra-Login – jeder Mitarbeiter bleibt eine eigene
   Entra-Identität mit korrektem Audit-Trail (ADR-6), keine parallele
   Auth-Logik neben Entra ID (Unterschied zum ganz am Anfang verworfenen
   "ein geteiltes Konto + App-PIN"-Ansatz oben: hier bleibt die Identität
   pro Mitarbeiter erhalten, nur die *Eingabe* des Benutzernamens wird durch
   den Barcode-Scan abgekürzt).

**Bewusst kein Silent-SSO zwischen zwei Logins auf demselben Tablet (Nachfrage
vom 11.08. nach dem `tablet-user`-Test):** Der Mitarbeiter muss **bei jedem**
Login erneut sein Passwort eingeben, auch wenn kurz zuvor schon jemand (er
selbst oder ein Kollege) am selben Tablet eingeloggt war - der Barcode-Scan
liefert nur den Benutzernamen (`loginHint`), nie eine Authentifizierung.
Würde die App/MSAL sich eine Sitzung über den Gerätewechsel zwischen
Mitarbeitern hinweg "merken", könnte ein Mitarbeiter versehentlich unter der
zuvor aktiven Identität eines Kollegen weiterarbeiten, nur weil dessen
Ausweis zuletzt gescannt wurde - auf einem **geteilten** Gerät nicht
akzeptabel. `platform-architecture.mdc`s allgemeine Silent-SSO-Forderung
bezieht sich auf den Wechsel zwischen Fachapplikation und eingebettetem
Baustein-Frontend (UI-Komposition), nicht auf aufeinanderfolgende Logins
verschiedener Personen am selben physischen Gerät - beide Fälle bewusst
unterschiedlich behandelt.

**Umsetzung (11.08.):**
- `app-hub-backend`: neues, bewusst **nicht authentifiziertes** Modul
  `backend/src/badge-login/` (`GET /badge-login/:badgeCode` →
  `{ userPrincipalName }`) – ruft `GraphService.findUserByEmployeeId()` auf
  (`GET /users?$filter=employeeId eq '...'`, bestehende `User.Read.All`-
  Berechtigung aus ADR-6 reicht). Eingaben werden vor dem Graph-Aufruf gegen
  ein striktes Format (`[A-Za-z0-9-]{3,64}`) geprüft (verhindert
  OData-Filter-Injection) und der Endpunkt ist per `@nestjs/throttler`
  (20 Aufrufe/Minute) gegen Enumeration abgesichert.
- Frontend: neue Ansicht "Ausweis scannen" direkt in
  `frontend/src/app/features/login/login-page.component.ts` (Umschalter
  neben dem normalen Microsoft-Login). Kamera-Zugriff/Decoding über
  `@zxing/browser` + `@zxing/library`, gekapselt in
  `core/services/barcode-scanner.service.ts` (Observable-basiert, damit die
  Komponente ohne echten Kamerazugriff testbar bleibt). Der Lookup-Call
  läuft über `core/services/badge-login.service.ts`; bei Erfolg startet
  `AuthService.login(upn)` (erweitert um einen optionalen `loginHint`) den
  normalen `loginRedirect`, der die Benutzername-Eingabe überspringt.
- `msalInterceptorConfigFactory` (`core/auth/msal-config.ts`) wurde von
  `${backendApiUrl}/*` auf `${backendApiUrl}/users/*` verengt, damit der
  MSAL-Interceptor beim Badge-Lookup (der ja *vor* dem Login passiert) kein
  Access Token anfordert.
- Onboarding-Voraussetzung bleibt: Das `employeeId`-Attribut jedes
  Mitarbeiters muss mit dem Wert seines vorhandenen Ausweis-Barcodes befüllt
  sein (Pflege durch den Kunden bzw. einmaliger Abgleich bei Onboarding,
  kein automatischer Sync mit einem Fremdsystem im Scope von ADR-7).

**Hands-on-Test (11.08.) zur allgemeinen Passkey-Option (ADR-7-Hauptregel
"Passkey/WebAuthn mit Passwort als Fallback", **nicht** Teil von Weg A oben,
weiterhin relevant für Mitarbeiter mit eigenem Gerät/PC):** Testbenutzer per
`backend/scripts/create-test-user.ts` im internen Confessio-Workforce-Tenant
angelegt, Passkey (FIDO2) aktiviert, Registrierung über
`https://mysignins.microsoft.com/security-info` erfolgreich durchgeführt.
Einschränkung: nur der Workforce-Tenant-Flow getestet, nicht der
CIAM-Flow (Custom-Domain-Voraussetzung, eigene Credential-Management-UI
laut Doku nötig) – bleibt offen, ist aber für das Tablet-Szenario nicht
mehr blockierend, da Tablets jetzt Weg A (Barcode + Passwort) nutzen.

**End-to-End-Test (11.08.):** Bei der Testnutzerin `lisabeicht@confessio-management.de`
`employeeId` per `backend/scripts/set-employee-badge-id.ts` auf einen Test-Barcode
gesetzt. Danach verifiziert:
- Backend: `GET /badge-login/<code>` liefert bei bekanntem Code 200 +
  korrekten UPN, bei unbekanntem Code 404, bei ungültigem Format 400, ab
  ~20 Aufrufen/Minute 429 (Rate-Limit greift).
- Frontend: Kamera-Ansicht ("Mit Ausweis anmelden") startet einen echten
  Video-Stream. Ein simulierter erfolgreicher Scan löst
  `AuthService.login(upn)` aus - die Microsoft-Login-Seite zeigt danach
  direkt `lisabeicht@confessio-management.de` vorausgefüllt und springt
  ohne Benutzername-Eingabe direkt zum Kennwort-Feld.

**Entscheidung (11.08.):** Der Test-Barcode `TEST-BADGE-001`
(`employeeId`) bei `lisabeicht@confessio-management.de` bleibt bewusst
bestehen - dient als dokumentierte Demo-Fixture für künftige
Vorführungen/Tests des Barcode-Logins, kein Aufräum-Punkt mehr.

**Zusätzliche Demo-Fixture (11.08., nach dem öffentlichen Ingress aus
ADR-11):** Für den Login-Test über die öffentliche URL wurde ein
dedizierter Testbenutzer `tablet-user@ConfessioManagement.onmicrosoft.com`
angelegt (`employeeId: TABLET-001`), statt das echte Konto einer echten
Person zu verwenden - Grund: reale Konten (wie Lisas) haben ein echtes,
dem Nutzer bekanntes Passwort, das der Agent nicht kennt/eingeben kann;
`tablet-user` hat stattdessen ein **festes** (nicht bei erstem Login zu
änderndes) Passwort erhalten, passend zu "Weg A" (siehe oben) - genau das
Verhalten, das ein realer Werkstatt-Mitarbeiter-Account später auch hat.
`create-test-user.ts` wurde dafür um `--employee-id` und `--fixed-password`
erweitert (statt eines Extra-Skripts, da es dieselbe Grundaufgabe ist).
Barcode-Bilder für beide Fixtures liegen lokal (nicht committet) unter
`docs/test-fixtures/*.png` (Code-128, generiert mit `python-barcode`).

**Bekannte offene Punkte (separate, spätere Entscheidungen):**
- Klären, welche Barcode-Symbologie GERIMAs Ausweise nutzen (Bild deutet auf
  Code 128 hin) und das in der Scan-Bibliothek gegenprüfen. `@zxing/library`
  deckt Code 128 bereits ab (Standard-Format, keine Konfiguration nötig),
  ein Test mit einer echten Karte (physischer Scan, nicht simuliert) steht
  noch aus.
- Prozess für die einmalige Befüllung von `employeeId` je Mitarbeiter im
  Kunden-Onboarding festlegen (manuell vs. CSV-Import vs. Graph-Skript) -
  `set-employee-badge-id.ts` ist nur ein Einzel-Test-Hilfsskript, kein
  Massen-Onboarding-Tool.
- Passkey-Hands-on-Test für den echten CIAM-Flow bleibt offen (siehe oben),
  jetzt aber unabhängig von den Tablet-Mitarbeitern.

**Aufräumen (11.08.):** Testbenutzer
`passkey-test@ConfessioManagement.onmicrosoft.com` per neuem Gegenstück-
Skript `backend/scripts/delete-test-user.ts` (`npm run delete-test-user --
--tenant <id> --upn <upn>`) wieder gelöscht.

## ADR-8: `backend/scripts/provision-customer-tenant.ts` – automatisierte App-Registrierung pro Kunden-Tenant

> **Status (23.10.2026):** Bestand, Ziel abgelöst durch ADR-18. Clients,
> Realms und Flows werden künftig als Keycloak-Config-as-Code gepflegt
> (IAM-Konzept §1 Prinzip 10, §20 `infrastructure/keycloak/`).

**Kontext:** ADR-7 verlangt pro Kunde einen eigenen, isolierten Tenant. Die
dafür nötige App-Registrierung (App Roles, "Expose an API"-Scope,
Microsoft-Graph-Berechtigungen + Admin-Consent, Client-Secret) manuell im
Portal anzulegen, ist genau die Klick-Arbeit, die beim Confessio-Test-Tenant
schon mehrere Anläufe brauchte (siehe ADR-6, "Bekannte offene Punkte") – bei
n vielen Kunden nicht skalierbar und fehleranfällig.

**Entscheidung:** Ein Node/TypeScript-Skript (`npm run provision:tenant`,
`npm run provision:assign-admin` im Backend) automatisiert das per
Microsoft Graph:

- Meldet sich per **Device-Code-Flow** interaktiv im Ziel-Tenant an, unter
  Verwendung von Microsofts eigenem, multi-tenant-fähigem "Microsoft Graph
  Command Line Tools"-Client (`14d82eec-204b-4c2f-b7e8-296a70dab67e`) – dafür
  ist **keine** eigene Bootstrap-App-Registrierung nötig, kein
  Henne-Ei-Problem beim allerersten Setup eines neuen Tenants.
- Legt die App-Registrierung samt App Roles (`User`, `Administrator` – Werte
  müssen zu `app-role.constants.ts` passen), SPA-Redirect-URI, "Expose an
  API"-Scope `access_as_user`, den drei Microsoft-Graph-Application-
  Permissions inkl. programmatischem Admin-Consent (App-Role-Assignment auf
  die eigene Service Principal) und einem Client-Secret an.
- Optional (`--first-admin-upn`): weist einer angegebenen Person direkt die
  Rolle `Administrator` zu – löst das in ADR-7 dokumentierte
  Bootstrap-Admin-Henne-Ei-Problem für den allerersten Nutzer eines neuen
  Kunden-Tenants. `provision:assign-admin` erlaubt dieselbe Zuweisung auch
  losgelöst/wiederholt (z. B. für einen zweiten Administrator später).

**Konsequenz / Trade-off:** Aus "n mal dieselbe Klick-Sequenz im Portal" wird
ein einziger Kommandozeilenaufruf pro neuem Kunden-Tenant. Das Skript ist
**idempotent im Sinne von "sicher abbrechen"**, nicht "sicher wiederholbar":
Existiert bereits eine App mit demselben `--display-name`, bricht es mit
einer klaren Fehlermeldung ab, statt eine zweite, konkurrierende
App-Registrierung anzulegen – ein vollständiger Update-Pfad für bereits
bestehende Registrierungen ist bewusst (noch) nicht gebaut (YAGNI, siehe
`clean-code.mdc`), da der heutige Anwendungsfall "einmal pro neuem Kunde"
ist.

**Bekannte Grenzen (bewusst nicht Teil dieses Skripts):**
- Erstellt **keinen** Entra-(External-ID-)Tenant selbst – der muss bereits
  existieren (siehe ADR-7, offener Punkt "automatisierte
  Tenant-Provisionierung").
- Konfiguriert **keine** Self-Service-Sign-up-User-Flows, **keine**
  Passkey-Richtlinie/-Profile und **keine** Ausgabe/Registrierung der
  FIDO2-Mitarbeiterausweise (ADR-7-Ergänzung) – das sind separate, noch zu
  automatisierende Schritte desselben Kunden-Onboarding-Prozesses.
- Das erzeugte Client-Secret wird nur einmalig auf der Konsole ausgegeben
  (Microsoft Graph gibt es kein zweites Mal heraus) – die Übergabe an das
  tatsächliche Kubernetes-Secret des Kunden-Clusters ist aktuell ein
  manueller Schritt.

**Bekannte offene Punkte (separate, spätere Entscheidungen – nicht Teil
dieser ADR):**
- Automatisierte Provisionierung von Kunden-Clustern + zugehörigem
  Entra-External-ID-Tenant (Teil des 1-Klick-Verkaufs-Flows).
- Test→Prod-Transport-Mechanismus für Kunden-Cluster.
- Lösung für das Bootstrap-Admin-Problem oben.

## ADR-9: Zwei Vertriebsmodelle ("Fall 1"/"Fall 2"), aber ein einheitliches Cluster-pro-Kunde-Modell – bewusst keine Mandantenfähigkeit

> **Status (23.10.2026):** Gilt für die Infrastruktur. Das IAM-Konzept (§4)
> sieht für „Confessio SaaS“ jedoch gemeinsam betriebene Realms mit
> mehreren Organisationen vor und verlangt Mandantenfilter über
> `organization_id` in jeder fachlichen Abfrage – unabhängig vom
> Cluster-Modell. Ob Fall 1 dadurch künftig geteilte IAM-Instanzen nutzt,
> ist offene ADR 1 des IAM-Konzepts.

**Kontext:** Axora verkauft seine AI-Apps (`ai-app-hub` und n weitere, siehe
`frontend/src/assets/konfiguration.json`, z. B. AI Datenorchestrator, AI
Service Intelligence, AI Process Steering) über zwei grundverschiedene Wege.
Bevor die technische Cluster-Provisionierung (Bicep, siehe geplante nächste
Schritte) gebaut wird, muss geklärt sein, ob dafür eine oder mehrere
Infrastruktur-Topologien nötig sind.

**Die zwei Vertriebsmodelle:**

- **Fall 1 – "Plug & Play" (Self-Service-Kauf):** Ein Kunde (typischerweise
  klein, z. B. eine Einzelanwältin/kleine Kanzlei) kauft eine einzelne
  Axora-App mit einem Klick auf der Homepage. Direkt danach muss die App
  nutzbar sein – ohne manuellen Eingriff von Confessio. Der Kunde nimmt dafür
  hin, dass die vollautomatisierte Provisionierung im Hintergrund einige
  Minuten dauert.
- **Fall 2 – Beratungsintensive Industrieprojekte:** Kein Self-Service,
  sondern ein von Confessio begleitetes Implementierungsprojekt. Der Kunde
  (typischerweise ein Industrieunternehmen) nutzt **mehrere, miteinander
  verzahnte** Axora-Apps gleichzeitig (z. B. liefert der AI Datenorchestrator
  Stammdaten für den AI Angebotsgenerator; AI Service Intelligence und AI
  Process Steering ergänzen den Produktions-/Servicekontext). `ai-app-hub`
  ist dabei der erste technische Pilot, dem schrittweise weitere Apps folgen.
  Wegen der projekthaften Einführung mit Abnahme braucht dieser Kunde einen
  **Test-Cluster** (zum Konfigurieren/Abnehmen) **und** einen **Prod-Cluster**,
  mit einem bewussten Transport-Schritt Test→Prod.

**Entscheidung:** Es gibt **kein** mandantenfähiges (Multi-Tenant-)
Infrastrukturmodell – explizit verworfen, obwohl es für Fall 1 naheliegend
gewirkt hätte, weil viele kleine Kunden sich sonst einen gemeinsamen Cluster
teilen könnten. Bewusst dagegen entschieden, damit sich die
Cloud-Betriebskosten je Kunde klar zurechnen lassen (Kostentransparenz vor
Ressourceneffizienz). Beide Fälle laufen stattdessen über **dasselbe
Grundprinzip "ein eigener, dedizierter Cluster pro Kunde"** (bereits so in
ADR-7 angelegt), Fall 2 einfach zweimal instanziiert:

| | Anzahl Cluster/Kunde | Provisionierungs-Trigger | Apps im Cluster |
|---|---|---|---|
| Fall 1 | 1 (Prod) | automatisiert, durch Kaufklick auf der Homepage | i. d. R. eine einzelne App |
| Fall 2 | 2 (Test + Prod) | ausgelöst durch das Beratungsprojekt-Team, nicht durch Self-Service | mehrere, schrittweise ergänzte, miteinander verzahnte Apps |

Daraus folgt für die technische Umsetzung: **eine einzige, wiederverwendbare
Cluster-Provisionierungs-Vorlage** (Bicep, siehe nächste Schritte) statt
zweier unterschiedlicher Infrastruktur-Mechanismen – sie wird für Fall 1
einmal pro Kunde aufgerufen, für Fall 2 zweimal (Test, dann Prod).

**Konsequenz / Trade-off:** Kein Ressourcen-Sharing zwischen Kunden (höhere
Grundkosten pro Kleinkunde in Fall 1 als bei einer Multi-Tenant-Lösung), dafür
klare Kostenzurechnung pro Kunde und identische Isolationsgarantien (Daten,
Identität, Infrastruktur) für alle Kunden unabhängig vom Vertriebsweg – kein
Sonderfall "der kleine Kunde ist weniger isoliert als der große". Passt zu
`platform-architecture.mdc` ("Datenbank per Service"/strikte Kapselung wird
hier auf Cluster-Ebene fortgesetzt).

**Umsetzung:** `infra/bicep/` enthält die Bicep-Vorlage: `platform/main.bicep`
(einmalig, zentrale ACR `acraxoraplatform`) und `customer-cluster/main.bicep`
(n-mal aufrufbar, ein AKS-Cluster pro Kunde+Umgebung inkl. `AcrPull`-Rolle auf
die zentrale ACR). Details und Deploy-Befehle siehe `infra/bicep/README.md`.

**Tatsächlich deployed (11.08.):** Subscription "Azure-Abonnement 1"
(`39d133a2-...`, Tenant `ConfessioManagement.onmicrosoft.com`). Zwei
Stolpersteine dabei, jetzt als neue Defaults in der Vorlage:
- `kubernetesVersion` Default war `1.29` – in West Europe nicht mehr
  unterstützt (`az aks get-versions --location westeurope`) → auf `1.36.2`
  angehoben.
- `nodeVmSize` Default war `Standard_D2s_v5` – auf dieser Subscription
  0 vCPU-Quota für die `DSv5`-Familie (`az vm list-usage --location
  westeurope`) → auf `Standard_D2s_v3` (dort Quota vorhanden) geändert. Bei
  neuen Kunden-Subscriptions ist ein Quota-Check vor dem Deploy sinnvoll.

Ergebnis: zentrale ACR `acraxoraplatform.azurecr.io` (`rg-axora-platform`)
und `confessio-test`-Cluster `aks-confessio-test` (`rg-confessio-test`,
2× `Standard_D2s_v3`, Kubernetes 1.36.2, OIDC-Issuer aktiv), inkl.
automatischer `AcrPull`-Rolle – beides per `az deployment sub create`
verifiziert (`provisioningState: Succeeded`, Rollenzuweisung sichtbar in
`az role assignment list`).

**Bekannte offene Punkte (separate, spätere Entscheidungen – nicht Teil
dieser ADR):**
- Automatisierter 1-Klick-Provisionierungs-Flow für Fall 1 (Kauf →
  `az deployment sub create` → Tenant-Provisionierung → Fertigmeldung an den
  Kunden) – aktuell nur manueller CLI-Aufruf.
- GitHub-Actions-Pipeline mit OIDC/Workload Identity Federation für den
  Bicep-Deploy selbst (Cluster ist mit `oidcIssuerProfile`/`workloadIdentity`
  bereits dafür vorbereitet).
- Test→Prod-Transport-Mechanismus für Fall 2 (`confessio-prod` fehlt noch).

## ADR-10: `ai-app-hub` als erste App per Helm im `confessio-test`-Cluster – technischer Erfolgsnachweis

**Kontext:** ADR-9 hat den `confessio-test`-Cluster als Infrastruktur
angelegt, aber leer. Ziel: `ai-app-hub` als ersten technischen Piloten
tatsächlich darin laufen lassen (siehe Big-Picture-Diskussion in ADR-9),
bevor n weitere Apps folgen.

**Entscheidung:** Ein Helm-Chart pro Service (`helm/ai-app-hub-backend/`,
`helm/ai-app-hub-frontend/`, siehe `deployment.mdc`: "ein Chart pro Service
... je nach Projektgröße"), mit `values.yaml` für Defaults und
`values-test.yaml` für Cluster-spezifische, nicht-sensitive Overrides
(Cluster-Name, Azure-Tenant-/Client-ID – für ein SPA ohnehin öffentlich,
siehe `platform-architecture.mdc`). Secrets (Backend-Client-Secret) werden
**nicht** in Chart-Dateien eingecheckt, sondern per `--set-string` beim
`helm install`/`upgrade` übergeben (siehe `deployment.mdc`). Beide Charts
haben Resource-Requests/-Limits und Liveness-/Readiness-Probes (Backend:
`/health`, Frontend: `/`) – beide Pflicht laut `deployment.mdc`.

**Zwei reale Fehler beim ersten Deploy gefunden und behoben:**
1. **Bug in `backend/Dockerfile`** (nicht K8s-spezifisch, existierte schon
   vorher, ist aber nie aufgefallen): `CMD ["node", "dist/main.js"]` war
   falsch – `nest-cli.json` hat `sourceRoot: "src"`, wodurch der Build nach
   `dist/src/main.js` compiled, nicht nach `dist/main.js`. Lokal per Docker
   Compose lief immer `npm run start:dev` (ts-node direkt, kein Build), das
   Produktions-Image wurde vor diesem Deploy nie tatsächlich gestartet.
   Fix: `CMD ["node", "dist/src/main.js"]`.
2. **Gecachtes Image auf dem AKS-Node**: Ein zweiter `az acr build`-Push auf
   denselben Tag (`v1.0.1`) wurde vom Node wegen `imagePullPolicy:
   IfNotPresent` nicht neu gezogen – `kubectl rollout restart` startete
   scheinbar neu, lief aber mit dem alten, fehlerhaften Image weiter.
   Gelöst durch Deploy mit einem neuen, eindeutigen Tag (`<git-sha>-fix1`)
   statt erneutem Push auf denselben Tag – bestätigt nochmal, warum
   `deployment.mdc` unveränderliche Tags (Git-SHA) statt `latest`/wiederver-
   wendeter Tags fordert.

**Tatsächlich verifiziert (11.08., `confessio-test`):** Beide Pods
`Running`/`1/1 Ready`. Per `kubectl port-forward`: Backend `GET /health` →
`{"status":"ok"}`, Frontend `GET /` → HTTP 200, `GET /runtime-config.json`
enthält korrekt die `confessio-test`-spezifischen Werte (Cluster-Name,
Tenant-/Client-ID, Backend-URL) – derselbe Image-Build läuft unverändert in
jedem weiteren Kunden-Cluster, nur mit anderen Helm-Values.

**Umsetzung (11.08., Trigger korrigiert am 13.08.):**
`.github/workflows/deploy-confessio-test.yml`. Auth gegenüber Azure per
**OIDC/Workload Identity Federation** (`azure/login`, kein Client-Secret
für die Pipeline selbst, siehe `deployment.mdc`): eigene
App-Registrierung `gh-actions-ai-app-hub-deploy`, Federated Credential mit
`subject: repo:joergbeicht/ai-app-hub:environment:confessio-test` (nur
gültig aus diesem GitHub-Environment heraus), Rollen `AcrPush` auf die
zentrale ACR und `Azure Kubernetes Service Cluster Admin Role` auf
`aks-confessio-test`. Nicht-sensitive Werte (Client-/Tenant-/
Subscription-ID) als Environment-**Variablen**, der App-eigene
Graph-Client-Secret (ADR-6) als Environment-**Secret**
(`APP_AZURE_CLIENT_SECRET`) – bewusst unter anderem Namen als die
Deploy-Identity, um beide Identitäten (Pipeline-Login vs. App selbst) nicht
zu verwechseln.

**Trigger-Korrektur (13.08.):** Ursprünglich bewusst nur
`workflow_dispatch` plus **Required Reviewer** auf dem
`confessio-test`-GitHub-Environment (manuelle Freigabe vor jedem Lauf) –
mit der Begründung "kein Automatismus bei jedem Push, siehe
`testing-pipeline.mdc`: fehlende Prod-Smoke-Tests/Rollback-Logik". Diese
Begründung war falsch auf den Test-Cluster angewendet: Sie gilt für einen
späteren **Prod**-Workflow (Übergang Test→Prod braucht Kontrolle), nicht
für Test selbst – ein Test-Cluster soll im Gegenteil **immer** den
aktuellen `main`-Stand zeigen, ohne dass jemand manuell auf "Deploy"
klicken muss. Required Reviewer wurde bereits vorher entfernt (leeres
`protection_rules`), der Trigger ist jetzt zusätzlich `on: push:
branches: [main]` (plus weiterhin `workflow_dispatch` für manuelle
Re-Deploys, z. B. nach einem fehlgeschlagenen Lauf). Die
Smoke-Test/Rollback-Vorsicht bleibt als offener Punkt für den künftigen
`confessio-prod`-Workflow bestehen (siehe unten).

**Bekannte, bewusste Vereinfachung (Test-Cluster, nicht Prod):** Die
Deploy-Identity hat `Cluster Admin Role` auf den ganzen AKS-Cluster statt
fein-granularer, auf den `ai-app-hub`-Namespace beschränkter Rechte (Azure
RBAC for Kubernetes Authorization + Namespace-Role wäre der sauberere,
spätere Ausbau, siehe offene Punkte).

**Bekannte offene Punkte (separate, spätere Entscheidungen – nicht Teil
dieser ADR):**
- ~~Kein Ingress-Controller/TLS/DNS~~ – gelöst, siehe ADR-11.
- Deploy-Identity-Rechte auf AKS von Cluster-weit auf den `ai-app-hub`-
  Namespace verengen (Azure RBAC for Kubernetes Authorization).
- Analoger Workflow für `confessio-prod` existiert als
  `deploy-confessio-prod.yml` (`workflow_dispatch` only, kopiert die
  laufenden Test-Images, kein Rebuild). GitHub-Environment
  `confessio-prod` plus Federated Credential
  `environment:confessio-prod` und AKS-Rechte auf `aks-confessio-prod`
  müssen in Azure/GitHub noch angelegt werden. Auslöser ist das
  Operations Center, nicht ein Push auf `main`.

## ADR-11: Öffentlicher Ingress (NGINX + cert-manager + Azure-DNS-Label) statt `kubectl port-forward`

**Kontext:** ADR-10 hatte `ai-app-hub` im Cluster lauffähig, aber nur via
`kubectl port-forward` von einem einzelnen Entwickler-Rechner aus erreichbar
– kein echter öffentlicher Endpunkt, MSAL-Redirect-Login-Flow im Cluster
deshalb nie End-to-End im Browser getestet ("bedeutet das, wir haben eine
öffentliche App-URL" war explizit noch zu verneinen).

**Entscheidung:** Pro Kunden-Cluster (analog für Fall 1 und Fall 2, siehe
ADR-9) folgendes, wiederholbares Bootstrapping – einmalig cluster-weit, NICHT
Teil des App-Deploy-Workflows (`deploy-confessio-test.yml` referenziert es
nur):
1. **NGINX Ingress Controller** (`ingress-nginx/ingress-nginx`-Helm-Chart,
   Namespace `ingress-nginx`) – Standardwahl für AKS ohne bestehende
   Azure-Application-Gateway-Anforderung (siehe `deployment.mdc`: Helm
   Charts für K8s-Ressourcen, auch für Infra-Komponenten).
2. **Kostenloser Hostname per Azure-DNS-Label** auf der vom Controller
   erzeugten Public-LoadBalancer-IP
   (`service.beta.kubernetes.io/azure-dns-label-name: confessio-test` →
   `confessio-test.westeurope.cloudapp.azure.com`) – keine eigene Domain/DNS-
   Zone nötig, kein zusätzlicher Kostenpunkt. Bei Kunden mit eigener Domain
   ist ein CNAME auf diesen Hostnamen (oder ein eigenes DNS-Label) jederzeit
   nachrüstbar, ohne dass sich am Ingress selbst etwas ändert.
3. **cert-manager** (`jetstack/cert-manager`-Helm-Chart, Namespace
   `cert-manager`, inkl. CRDs) + ein `ClusterIssuer` für Let's Encrypt
   (eigenes, kleines Chart `helm/cluster-issuer/`, `environment: prod` seit
   dem ersten erfolgreichen Testlauf) – automatisch ausgestellte, echte
   Browser-vertraute Zertifikate statt selbstsignierter Zertifikate oder
   manueller Erneuerung.
4. **Ein gemeinsamer Ingress pro Fachapplikation** (`helm/ai-app-hub-ingress/`)
   statt je einem Ingress pro Service-Chart: Frontend und Backend teilen sich
   Host und TLS-Zertifikat (`/` → Frontend, `/api` → Backend mit
   `rewrite-target`, Backend-Routen liegen intern auf Root-Ebene wie
   `/users`, `/health`). Ein gemeinsamer Ingress vermeidet doppelte
   Zertifikatsanfragen für denselben Host (cert-manager würde sonst pro
   Ingress-Ressource ein eigenes Certificate/Secret für denselben Hostnamen
   erzeugen).
5. Backend `CORS_ORIGIN` und Frontend `backendApiUrl` in `values-test.yaml`
   auf den öffentlichen HTTPS-Host umgestellt (Backend läuft intern
   weiterhin auf Klartext-HTTP, TLS wird am Ingress terminiert). Frontend und
   Backend sind jetzt technisch dieselbe Origin (nur unterschiedliche
   Pfade) – CORS greift nur noch als zusätzliche Absicherung.
6. **Azure AD App Registration**: neue SPA-Redirect-URI
   `https://confessio-test.westeurope.cloudapp.azure.com` zusätzlich zu
   `https://localhost:6054` ergänzt (per Microsoft-Graph-`PATCH`, da
   `az ad app update` kein `--spa-redirect-uris`-Flag hat).

**Zwei reale Fehler beim ersten Rollout gefunden und behoben (beide reine
Azure-RBAC-Lücken, nicht app-spezifisch):**
1. `az acr build` scheiterte mit `AuthorizationFailed` auf
   `registries/read`, obwohl die Deploy-Identity bereits `AcrPush` auf genau
   dieser ACR hatte – `AcrPush` deckt nur die Daten-Ebene
   (`pull/read`, `push/write`) ab, ACR Tasks (`az acr build`) brauchen
   zusätzlich Control-Plane-Zugriff. Fix: `Contributor`-Rolle, eng auf die
   ACR-Ressource selbst gescoped, ergänzt.
2. `az aks get-credentials` (ohne `--admin`) scheiterte mit
   `AuthorizationFailed` auf `listClusterUserCredential` – die vorhandene
   `Azure Kubernetes Service Cluster Admin Role` deckt nur
   `listClusterAdminCredential` ab. Fix: zusätzlich `Azure Kubernetes
   Service Cluster User Role`, gescoped auf den Cluster, ergänzt.

**Ein dritter, Azure-typischer Fehler bei der Zertifikatsausstellung
gefunden und behoben:** Die ACME-HTTP01-Challenge von Let's Encrypt schlug
zunächst mit "Timeout during connect" fehl – Azures Load-Balancer-Health-
Probe für den Ingress-Controller-Service prüfte standardmäßig Pfad `/` statt
eines dedizierten Health-Endpunkts. `nginx-ingress`s Default-Backend
antwortet auf `/` ohne passenden `Host`-Header mit `404`, wodurch Azure den
Node als "unhealthy" markierte und gar keinen Traffic mehr weiterleitete
(kein `RST`, daher "Timeout" statt "Connection refused"). Fix: Service-
Annotation `service.beta.kubernetes.io/azure-load-balancer-health-probe-
request-path: /healthz` (nginx-ingress liefert `/healthz` unabhängig vom
`Host`-Header immer mit `200`).

**Tatsächlich verifiziert (11.08., `confessio-test`):**
`https://confessio-test.westeurope.cloudapp.azure.com/` → HTTP 200 mit
echtem Let's-Encrypt-Zertifikat (`curl`/Browser, kein `-k` nötig);
`/api/health` → `{"status":"ok"}`; Login-Redirect zu
`login.microsoftonline.com` mit korrektem
`redirect_uri=https://confessio-test.westeurope.cloudapp.azure.com` bis zur
Konto-/Passwort-Eingabe im Browser bestätigt (MFA/Passwort selbst kann/soll
der Agent nicht für den Nutzer eingeben).

**Bekannte, bewusste Vereinfachung:** `letsencrypt-prod` direkt statt zuerst
`letsencrypt-staging` verwendet – vertretbar, da nur ein einzelner,
eindeutiger Hostname betroffen ist und Let's Encrypts Prod-Rate-Limits
(z. B. 5 doppelte Zertifikate/Woche pro exaktem Hostnamen) dabei nicht
relevant werden.

**Bekannte offene Punkte (separate, spätere Entscheidungen – nicht Teil
dieser ADR):**
- Vollständiger Login-Flow (inkl. Passwort/MFA) wurde nur bis zur
  Passwort-Eingabeseite verifiziert, nicht bis zum eingeloggten Zustand
  (erfordert menschliche Eingabe).
- `helm/ai-app-hub-ingress`, `ingress-nginx` und `cert-manager` sind noch
  nicht Teil der GitHub-Actions-Pipeline für das initiale Cluster-
  Bootstrapping (aktuell manuell per `helm install` beim Cluster-Setup) –
  nur der App-eigene Ingress-Chart-Aufruf ist bereits im Workflow.
- Eigene Kunden-Domain statt `*.cloudapp.azure.com` ist für Fall 1
  ("1-Klick-Kauf") vermutlich irrelevant (Kunde braucht keine eigene Marke
  auf der URL), für beratungsintensive Fall-2-Kunden ggf. gewünscht – dann
  CNAME auf den bestehenden Hostnamen, keine Änderung am Ingress nötig.

## ADR-12: PIN+ROPC-Login **nur für Tablet-Benutzer** statt Entra-Passwort bei jedem Login

> **Status (23.10.2026):** Bestand, **widerspricht dem IAM-Konzept**
> (§7.1: „Resource Owner Password Grant“ verboten). Der Tablet-Login darf
> nicht erweitert werden und muss vor dem B2B-Go-Live abgelöst werden. Der
> Ersatz (z. B. gerätegebundene BFF-Session nach einmaliger
> Passkey-/Einladungsaktivierung) braucht eine eigene ADR.

**Kontext:** ADR-7 "Weg A" verlangt bei jedem Login ein echtes, Entra-
konformes Passwort (mind. 8 Zeichen, 3 von 4 Komplexitätsklassen) – das
wurde beim `tablet-user`-Test (11.08.) explizit als **nicht akzeptabel**
für Werkstatt-Mitarbeiter zurückgewiesen: gewünscht ist Barcode + entweder
ein kurzer 4-stelliger PIN oder gar keine erneute Eingabe für bis zu einem
Jahr (auf demselben Gerät). **Ausdrücklich nur für Tablet-Benutzer** – PC-
Benutzer/Büro-Mitarbeiter bleiben unverändert beim normalen MSAL-Redirect
zu Microsofts gehosteter Login-Seite mit echtem Passwort/MFA (unverändert
gegenüber ADR-6/ADR-7, entspricht weiterhin der SSO-Vorgabe aus
`platform-architecture.mdc`).

**Warum Entras eigene Login-Seite dafür nicht genutzt werden kann:** Die
Passwortrichtlinie ist eine feste Plattform-Vorgabe (ADR-7), nicht
konfigurierbar. Ein 4-stelliger PIN oder "kein Login für 1 Jahr" ist auf
`login.microsoftonline.com` technisch nicht abbildbar. Es gibt nur einen
Ausweg: Tablet-Benutzer werden **nie mehr auf Microsofts Login-Seite
geschickt** – `app-hub-backend` übernimmt die eigentliche Entra-
Authentifizierung im Hintergrund per **Resource Owner Password Credentials
(ROPC)**-Flow, mit einem echten, komplexen Passwort, das ausschließlich
das Backend kennt.

**Entscheidung – Architektur:**

1. **Nur explizit markierte Tablet-Benutzer** sind dazu berechtigt: eine
   dedizierte Entra-Sicherheitsgruppe (`AI-App-Hub-Tablet-Users`, ID über
   `TABLET_USERS_GROUP_ID` konfiguriert). `GraphService` prüft vor jedem
   PIN-Login die Gruppenmitgliedschaft – ohne Mitgliedschaft funktioniert
   der neue Endpunkt für den jeweiligen Account nicht, unabhängig vom PIN.
   Damit bleibt das Risiko (gespeicherte Klartext-fähige Passwörter, ROPC
   ohne MFA) strikt auf diese Gruppe begrenzt, PC-Konten sind nie
   betroffen.
2. **Pro Tablet-Benutzer ein Secret in Azure Key Vault**
   (`tablet-cred-<badgeCode>`, Key-Vault-Secret-Namen erlauben dieselbe
   Zeichenmenge wie `BADGE_CODE_PATTERN`), JSON-Inhalt:
   `userPrincipalName`, das echte (zufällig erzeugte, Entra-konforme)
   `entraPassword`, ein `pinHash` (bcrypt) für den vom Mitarbeiter
   gewählten 4-stelligen PIN, plus `failedAttempts`/`lockedUntil` für
   Lockout nach 5 Fehlversuchen (15 Minuten Sperre) – der kleine PIN-Raum
   (10.000 Kombinationen) braucht zwingend Lockout, sonst wäre er in
   Minuten per Brute-Force zu erraten. Bewusst **kein** eigenes Postgres
   für diese Daten (YAGNI/Scope-Disziplin, siehe ADR-2 "schmales Backend")
   – Key Vault reicht für die zu erwartende Anzahl Tablet-Benutzer pro
   Kunden-Cluster, hat eigenes Access-Logging/Verschlüsselung und macht
   ein zweites Speichersystem neben Graph unnötig. Bei nachweislichem
   Bedarf (hohe Nebenläufigkeit, viele gleichzeitige Fehlversuche) ist ein
   Wechsel auf eine echte DB später ein reiner Implementierungsdetail-
   Wechsel hinter `TabletAuthService`.
3. **Login-Ablauf** (`POST /tablet-auth/login`, unauthentifiziert wie
   `badge-login`, aber mit strengerem Rate-Limiting):
   Badge-Code → `employeeId`-Lookup (Graph, wie ADR-7) → Gruppen-Check →
   PIN-Hash-Vergleich (bcrypt) → bei Erfolg: ROPC-Aufruf gegen
   `https://login.microsoftonline.com/<tenant>/oauth2/v2.0/token` mit
   `grant_type=password`, App-Client-ID/-Secret (dieselbe Registrierung
   wie für Graph, ADR-6) + dem in Key Vault gespeicherten echten Passwort.
   Backend validiert das resultierende Entra-ID-Token (gleiche
   JWKS-Prüfung wie `AzureJwtGuard`) und stellt daraus ein **eigenes,
   kurzlebiges Session-JWT** (8h, ein Arbeitsschicht-Zeitraum) für das
   Frontend aus – das Frontend bekommt das echte Entra-Passwort nie zu
   Gesicht, nur unser eigenes Token.
4. **1-Jahres-Option**: Bei jedem erfolgreichen PIN-Login stellt das
   Backend zusätzlich ein **Device-Token** aus (eigenes JWT, 365 Tage,
   `tokenUse: "tablet-device"`), das das Frontend lokal (pro Badge-Code)
   speichert. `POST /tablet-auth/renew` nimmt dieses Device-Token statt
   PIN entgegen, führt denselben ROPC-Austausch aus (Passwort kommt
   weiterhin aus Key Vault) und stellt ein frisches Session- **und**
   Device-Token aus (sleitendes Fenster, ähnlich einem Refresh-Token) –
   dadurch muss ein Mitarbeiter auf einem ihm vertrauten Tablet i. d. R.
   nie wieder den PIN eingeben, nur beim allerersten Login auf einem neuen
   Gerät oder nach Ablauf.
5. **PC-Login bleibt komplett unberührt**: `AuthService` im Frontend
   unterscheidet zwei parallele Sitzungs-Quellen (MSAL-Account vs.
   eigenes Tablet-Session-Token) hinter derselben, bestehenden Fassade
   (`currentUser`/`isLoggedIn`) – `authGuard`, Router, restliche
   Komponenten merken den Unterschied nicht.

**Bewusste Trade-offs/Risiken (dokumentiert, nicht versteckt):**
- **ROPC ist von Microsoft als "Legacy" eingestuft** und schlägt fehl,
  sobald irgendeine Conditional-Access-Regel für diese Konten MFA
  verlangt. Betriebsanforderung: Die `AI-App-Hub-Tablet-Users`-Gruppe
  **muss** von jeder MFA-Pflicht-Regel ausgenommen sein/bleiben – gilt nur
  für diese Gruppe, nicht für PC-Konten.
- **Das Backend wird zur Passwort-Verwalterin** für Tablet-Konten (Bruch
  mit "wir speichern nie Passwörter") – bewusst akzeptiert, weil diese
  Passwörter nie ein Mensch kennt/eingibt und ausschließlich in Key Vault
  liegen (Zugriff nur über die App-eigene Managed Identity/Client-Secret,
  gleiche Berechtigungsstufe wie der bestehende Graph-Zugriff).
- **1-Jahres-Device-Token auf einem geteilten Gerät**: Ist der Token für
  Mitarbeiter A auf Tablet X noch gültig, kommt jeder mit physischem
  Zugriff auf Tablet X (nicht nur A) ohne jede Eingabe hinein, solange
  As Badge nicht erneut gescannt werden muss, um den Token zu laden.
  Restrisiko ist bekannt und akzeptiert (Tablet gilt als betreutes
  Werkstattgerät, kein privates Gerät); Widerruf einzelner Device-Tokens
  ist aktuell nicht möglich (stateless JWT) – bei Bedarf später über eine
  Sperrliste in Key Vault nachrüstbar.
- 4-stelliger PIN ist bewusst pro Person, nicht pro Gerät – jeder
  Mitarbeiter bleibt eine eigene Entra-Identität mit korrektem
  Audit-Trail (unverändert gegenüber ADR-7).

**Umsetzung (11.08.):** Backend-Modul `backend/src/tablet-auth/` (`TabletAuthController`,
`TabletAuthService`, `KeyVaultService`, `RopcTokenService`, `TabletSessionTokenService`, jeweils
mit Unit-Tests) sowie `backend/scripts/provision-tablet-credential.ts` (Einzel-Provisionierung:
Entra-Passwort setzen, Gruppenmitgliedschaft, Key-Vault-Secret). Frontend:
`TabletAuthService`/`TabletSessionInterceptor` (parallele Sitzungsquelle neben MSAL, siehe
`AuthService`), `LoginPageComponent` um PIN-Eingabe erweitert (ersetzt den bisherigen
`loginHint`-Redirect für den Ausweis-Scan). Neue ENV-Variablen `AZURE_KEY_VAULT_URL`,
`TABLET_USERS_GROUP_ID`, `TABLET_SESSION_JWT_SECRET` (Helm-Values/`.env`/`docker-compose.yml`
ergänzt).

**Bekannte offene Punkte (separate, spätere Entscheidungen):**
- Key-Vault-Ressource, Entra-Sicherheitsgruppe `AI-App-Hub-Tablet-Users`
  und die zugehörige Zugriffsberechtigung für die App-Registrierung sind
  **noch nicht angelegt** (weder per Bicep/CLI noch manuell) – Code ist
  bewusst so gebaut, dass er ohne diese Konfiguration nur den neuen
  Tablet-Login-Endpunkt mit einer klaren 503-Fehlermeldung ablehnt, alle
  anderen Endpunkte (`/users`, `/badge-login`, `/health`) bleiben
  unverändert funktionsfähig (siehe `TabletAuthService`). Anlegen dieser
  Ressourcen (inkl. `confessio-test`) ist der nächste, separate Schritt
  nach diesem Code-Merge.
- Kein Self-Service für Mitarbeiter, ihren eigenen PIN zu setzen/ändern –
  vorgesehen per Skript (analog `set-employee-badge-id.ts`), noch zu
  schreiben.
- Keine Widerrufsliste für Device-Tokens (siehe oben).

## ADR-13: Explizite `version.json`-Prüfung + proaktives `activateUpdate()` für zuverlässige PWA-Updates auf Tablets

**Kontext:** Nach dem produktiven Rollout des Tablet-PWA-Logins (ADR-12)
kam eine neue Version nicht auf einem bereits laufenden Tablet an, obwohl
der Deploy erfolgreich war (`ADR-5`-Mechanismus: `VERSION_READY` →
`activateUpdate()` + Reload, per periodischem `SwUpdate.checkForUpdate()`).
Tablets werden – anders als ein normaler Browser-Tab – kaum je komplett
geschlossen; ein einzelner verpasster/verzögerter `VERSION_READY`-Zyklus
(bekannte Service-Worker-Unzuverlässigkeiten auf iOS/Windows, siehe
Analyse einer älteren, vergleichbaren PWA unter
`/Users/joergbeicht/Entwicklung/legacy`) lässt eine veraltete Version dann
tagelang laufen.

**Entscheidung:** Zwei unabhängige Erkennungswege statt nur einem, beide
münden in denselben Reload (`PwaUpdateService`):
1. **Bestehender Weg (ADR-5):** `SwUpdate.versionUpdates` (`VERSION_READY`)
   sowie periodisches `checkForUpdate()` alle 60 s / bei
   `visibilitychange`.
2. **Neuer Weg:** Explizites `fetch('/version.json', { cache: 'no-store' })`
   bei jedem Check-Zyklus, Vergleich gegen die einkompilierte
   `APP_VERSION`-Konstante. Bei Abweichung: `forceUpdateNow()` – erzwingt
   `checkForUpdate()` + `activateUpdate()` und, falls das nicht binnen
   8 Sekunden zum Reload führt (Fallback-Timer), einen harten
   `document.location.reload()` unabhängig vom Service-Worker-Zustand.
   Zusätzlich wird bei jedem regulären Check-Zyklus **proaktiv**
   `activateUpdate()` aufgerufen (nicht nur nach `VERSION_READY`) – holt
   eine bereits fertig heruntergeladene, aber nie aktivierte Version nach.

`version.json` wird bewusst **erst nach** `ng build` in den Dist-Ordner
geschrieben (`scripts/write-build-version-json.cjs`, `postbuild`-Hook in
`package.json`) – zum Zeitpunkt der `ngsw-config.json`-Verarbeitung
existiert die Datei noch nicht, landet also nie im Service-Worker-Manifest
und wird nie aus dessen Cache bedient (exakt dasselbe Prinzip wie bei
`runtime-config.json`, das erst beim Container-Start entsteht – siehe
ADR-2/`deployment.mdc`). `nginx.conf` setzt zusätzlich explizite
`no-cache`-Header für `/version.json` als zweite Absicherung auf
HTTP-Ebene.

**Konsequenz:** Ein neu deploytes Build wird auf einem dauerhaft
geöffneten Tablet spätestens beim nächsten 60-Sekunden-Check oder beim
nächsten Aufwecken des Bildschirms (`visibilitychange`) zuverlässig
erkannt und lädt – nötigenfalls per Holzhammer-Fallback – neu, statt auf
einen einzelnen, möglicherweise nie eintreffenden `VERSION_READY`-Event zu
warten. Kein Backend-`/api/version`-Endpunkt nötig (ADR-5 bleibt insofern
gültig) – `version.json` ist eine reine Build-Artefakt-Datei.

**Umsetzung (12.08.):** `scripts/lib/resolve-app-version.cjs` (gemeinsame
Versions-Resolution für `write-app-version.cjs` und neues
`write-build-version-json.cjs`), `package.json` (`postbuild`-Script),
`nginx.conf` (`location = /version.json`), `PwaUpdateService` (Fetch-Check
+ `forceUpdateNow()` + proaktives `activateUpdate()` bei jedem Zyklus) inkl.
Unit-Tests (`pwa-update.service.spec.ts`).

**Nachtrag (19.08.):** In lokaler Entwicklung (`ng serve` / `start:docker`)
lief nie ein `ng build`, also existierte `version.json` dort nie – jeder
Check-Zyklus produzierte einen `404` in der Konsole. Da der Service Worker
in `isDevMode()` ohnehin deaktiviert ist (`app.config.ts`), besteht dort
keine Cache-Manifest-Gefahr wie im `postbuild`-Fall; `version.json` kann in
Dev daher gefahrlos schon **vor** dem Start geschrieben werden. Neues
`scripts/write-dev-version-json.cjs` (nutzt ebenfalls
`resolve-app-version.cjs`), per `prestart`/`prestart:docker` erzeugt –
analog zu `write-runtime-config.cjs` nach `frontend/public/version.json`,
git-ignored, nie eingecheckt.

## ADR-14: Silent-SSO zwischen mehreren Axora-Apps im selben Entra-Tenant + Provisioning-Skript für weitere App-Registrierungen

**Kontext:** `ai-app-hub` ist der Startpunkt für n weitere Axora-Apps
(„Bausteine“/„Fachapplikationen“, siehe `platform-architecture.mdc`) –
der Hub öffnet sie per `window.open(url, '_blank', 'noopener,noreferrer')`
in einem neuen Tab (API-Komposition, kein iFrame; siehe
`app-card.component.ts`). Ziel: Eine Person, die sich bereits im Hub
angemeldet hat, muss beim Öffnen einer weiteren, im selben Kunden-Tenant
deployten App **kein zweites Mal ihr Passwort eingeben** – idealerweise
gar keine sichtbare Login-Seite sehen. Vor dieser Entscheidung gab es dafür
weder Code (`AuthService.login()` rief nur `loginRedirect()` auf, kein
`ssoSilent()`-Versuch) noch ein Skript, um eine **zweite** App-Registrierung
im selben Tenant anzulegen (`provision-customer-tenant.ts` bootstrapt nur
`ai-app-hub` selbst für einen neuen Kunden).

**Wie Silent-SSO hier funktioniert:** Der Login-Zustand liegt nicht bei
`ai-app-hub`, sondern als Sitzungs-Cookie bei Entra ID
(`login.microsoftonline.com`). Jede Axora-App bekommt weiterhin ihre
**eigene** App-Registrierung (eigene Client-ID, eigene Redirect-URI, eigener
`access_as_user`-API-Scope) – „volle Architektur pro Baustein“ bleibt
bestehen. Solange beide App-Registrierungen im selben Tenant liegen, kann
jede App beim Start per `ssoSilent()` (verstecktes iFrame zu Entra, kein
Redirect, kein Klick) prüfen, ob bereits eine Sitzung existiert, und sich
ohne Interaktion anmelden. Schlägt das fehl (keine Sitzung, Drittanbieter-
Cookies vom Browser blockiert, ...), fällt die App auf die normale
Login-Seite zurück – kein Regressionsrisiko.

**Entscheidung:**
1. **Frontend:** `initializeMsal()` (`app.config.ts`) versucht nach dem
   Verarbeiten der Redirect-Antwort automatisch `ssoSilent()`, falls noch
   kein Account im lokalen MSAL-Cache liegt – mit denselben Scopes wie
   `AuthService.login()`. Erfolg → `setActiveAccount()`, die Person landet
   direkt eingeloggt in der App, ohne die Login-Seite je zu sehen. Fehlschlag
   (`InteractionRequiredAuthError` oder sonstiger Fehler) wird bewusst
   verschluckt statt als Fehler geloggt – das ist der erwartete Normalfall
   beim allerersten Login oder nach Sitzungsablauf.
2. **Provisioning:** Neues, generisches Skript
   `backend/scripts/provision-app-registration.ts` (`npm run provision:app`)
   registriert eine **weitere** App im selben Tenant: SPA-Redirect-URI, App
   Roles (Default `User,Administrator`, per `--roles` überschreibbar),
   `access_as_user`-API-Scope. Anders als `provision-customer-tenant.ts`
   fordert es standardmäßig **keine** Microsoft-Graph-Berechtigungen an und
   legt **kein** Client-Secret an (YAGNI) – die meisten weiteren Apps
   validieren JWTs nur gegen das öffentliche JWKS-Format und rufen nie
   selbst Graph auf. Nur Apps mit eigener Graph-basierter Nutzerverwaltung
   (wie `ai-app-hub`) setzen `--with-graph-access`.
3. Gemeinsame Graph-Aufrufe (App-Registrierung anlegen, Service Principal,
   „Expose an API“, Admin-Consent, Client-Secret) wurden aus
   `provision-customer-tenant.ts` in `backend/scripts/lib/app-registration-graph.ts`
   extrahiert, damit beide Skripte dieselbe, getestete Logik nutzen statt
   sie zu duplizieren.

**Konsequenz / offene Punkte:**
- `konfiguration.json` enthält aktuell nur Platzhalter-URLs
  (`http://localhost:xxxx/...`) für alle Katalog-Apps – sobald eine echte
  zweite App deployt ist, muss der Eintrag auf die echte Produktions-URL
  zeigen, damit dieser Silent-SSO-Pfad überhaupt getestet werden kann.
- Silent-SSO per iFrame ist auf Drittanbieter-Cookies angewiesen; Browser
  mit strikter Cookie-Isolation (Safari ITP, künftig Chrome) können den
  stillen Weg verweigern – die App fällt dann automatisch auf die normale,
  interaktive Anmeldung zurück (kein Blocker, nur weniger nahtlos).
- Das neue Skript legt nur die Azure-Seite an; das Verdrahten der
  resultierenden `AZURE_CLIENT_ID`/`BACKEND_API_SCOPE` in `runtime-config`/
  Helm-Values der neuen App ist weiterhin ein manueller Schritt in deren
  eigenem Repo (siehe `platform-architecture.mdc`, „gepinnte
  Versionsangabe“, kein automatischer Nebeneffekt).

> **Status (23.10.2026):** Bestand, Ziel abgelöst durch ADR-18. Das
> IAM-Konzept setzt unsichtbare iframe-Logins bewusst **nicht** voraus
> (§1.1); SSO zwischen Apps läuft künftig über einen Top-Level-Redirect zu
> Keycloak aus dem BFF der jeweiligen App.

**Umsetzung (16.08.):** `app.config.ts` (`ssoSilent()`-Versuch in
`initializeMsal()`), `backend/scripts/lib/app-registration-graph.ts` (neu,
extrahierte Graph-Helfer), `provision-customer-tenant.ts` (auf die
gemeinsame Lib umgestellt, Verhalten unverändert),
`provision-app-registration.ts` (neu), `package.json`
(`provision:app`-Script).

## ADR-15: `navigationUrls`-Allowlist im PWA-Service-Worker (statt Default `/**`), weil der Hub sich einen Host mit anderen Fach-Apps teilt

**Kontext:** Seit dem `axora-operation-center`-Discovery-Mechanismus
(„Online-URLs im Hub“) laufen mehrere Axora-Apps auf **demselben** Host
(`confessio-test.westeurope.cloudapp.azure.com`), per Ingress pfadbasiert
getrennt – der Hub selbst besitzt den Catch-all-Pfad `/`, weitere Apps
bekommen eigene Präfixe (z. B. `ai-daten-orchestrator` unter
`/orchestrator/*`, siehe dessen `helm/ai-daten-orchestrator-ingress`).
Das ist auf Ingress-Ebene korrekt konfiguriert und funktioniert für sich
allein. ADR-5 hat den PWA-Service-Worker (`ngsw-config.json`) eingeführt,
**ohne** dabei zu berücksichtigen, dass der Hub künftig nicht mehr allein
auf seinem Host ist.

**Bug (18.08.2026):** `https://.../orchestrator/workflows` öffnete nicht
die AI-Datenorchestrator-App, sondern den Login-Screen des Hubs
("Axora - AI App Hub" als Titel). Ursache: `ngsw-config.json` hatte kein
eigenes `navigationUrls`, also griff Angulars Default
(`['/**', '!/**/*.*', '!/**/*__*', '!/**/*__*/**']`) – das matcht
**jede** Navigation ohne Dateiendung auf dem **gesamten Origin**, nicht
nur Pfade innerhalb des Hubs. Sobald der Browser den Hub-Service-Worker
einmal registriert hatte (Scope `/`, der gesamte Origin – Service Worker
kennen keine Ingress-Pfadgrenzen), wurde **jede** Navigation auf diesem
Host abgefangen und mit dem gecachten Hub-`index.html` beantwortet, auch
für Pfade einer komplett anderen App. Der Hub-Router kennt `/orchestrator/
workflows` naturgemäß nicht (`app.routes.ts` hat nur `/`, `/login`,
`/settings*`), fällt auf die Wildcard-Route zurück und leitet
unauthentifiziert auf `/login` um – exakt das beobachtete Symptom. Die
Ingress-Regeln selbst waren nie das Problem (nginx-ingress sortiert
Pfade nach absteigender Länge, `/orchestrator(/|$)(.*)` gewinnt dort
korrekt gegen `/()(.*)` – der Request erreichte den Cluster in diesem
Fall aber gar nicht, weil der Service Worker ihn schon im Browser
abgefangen hat).

**Entscheidung:** `navigationUrls` in `ngsw-config.json` von einer
Deny-Liste (alles außer Dateien) auf eine explizite Allow-Liste der
**eigenen** Hub-Routen umgestellt: `["/", "/login", "/settings",
"/settings/*"]`. Bewusst eine Allow-Liste der eigenen Routen statt einer
Deny-Liste fremder App-Präfixe – der Hub muss dadurch **nichts** über
andere Apps wissen (kein Codechange im Hub, wenn Slice 10/11/... eine
elfte Fach-App unter einem neuen Präfix bekommt), passend zum
ConfigMap-Discovery-Prinzip aus `axora-operation-center/docs/PLAN.md`
(„n Apps, kein Codechange pro neuer App“). Jede URL außerhalb dieser
Liste – egal ob eine fremde App oder eine künftige, noch nicht in die
Liste eingetragene Hub-Route – geht am Service Worker vorbei direkt ans
Netz und damit korrekt durch nginx-ingress zur jeweils richtigen App.

**Konsequenz / Trade-off:** Eine neue Hub-eigene Route (z. B. `/profile`)
funktioniert auch ohne Eintrag in `navigationUrls` – sie lädt dann nur
immer frisch vom Netz statt aus dem Service-Worker-Cache (kein
Offline-Vorteil für diese eine Route), bricht aber nichts. Umgekehrt:
Wer eine neue Hub-Route ergänzt und will, dass sie auch offline/als
gecachter Navigations-Eintrag funktioniert, muss sie hier bewusst
eintragen – kein automatischer Nebeneffekt, aber auch kein Blocker.

**Lehre:** Ein Service Worker mit Scope `/` kennt keine Ingress-
Pfadgrenzen – "mehrere Apps teilen sich einen Host über Pfad-Präfixe"
und "eine der Apps hat eine PWA mit Default-`navigationUrls`" sind für
sich genommen beide unauffällig, zusammen aber inkompatibel. Jede
weitere App mit eigenem Service Worker auf demselben Host bräuchte
dieselbe Allowlist-Behandlung (bisher hat außer dem Hub keine Axora-App
einen Service Worker).

## ADR-16: Retry + Fallback-UI für `runtime-config.json`-Fetch vor dem Bootstrap

**Bug (23.08.2026):** `https://confessio-test.westeurope.cloudapp.azure.com/`
zeigte gelegentlich eine komplett **weiße** (nicht Hub-dunkle) Seite – nur
der statische `<title>` aus `index.html` erschien, sonst nichts. Ein
zweiter Versuch über `/login` funktionierte dann. Erste Vermutung war ein
abgelaufenes Azure-Token; das passt aber nicht zum Symptom: `authGuard`
prüft nur, ob lokal ein zwischengespeicherter MSAL-Account existiert
(kein Live-Check gegen Azure), und selbst ein ungültiges Ergebnis dort
würde per `router.createUrlTree(['/login'])` zur (funktionierenden)
Login-Seite umleiten – nicht zu einer leeren Seite.

**Ursache:** `main.ts` ruft `loadRuntimeConfig()` (Fetch auf
`runtime-config.json`) **vor** `bootstrapApplication()` auf – Angular
existiert zu diesem Zeitpunkt noch gar nicht. Schlug dieser eine Fetch
fehl (kurzer Netzwerk-Hänger, kalter Pod, Ingress-Hickup – bei einer
Test-Cluster-Single-Replica nicht ungewöhnlich), landete der Fehler nur in
`console.error(err)`, `bootstrapApplication` wurde **nie** aufgerufen und
blieb für immer aus – daher die permanent weiße Seite ohne jede
Rückmeldung. Ein erneutes Laden (z. B. durch Eingabe von `/login`) ist
schlicht ein neuer Versuch, der meist einfach klappt – kein Bezug zu MSAL/
Azure-Tokens.

**Entscheidung:**
1. `loadRuntimeConfig()` (`core/runtime-config.ts`) versucht den Fetch bis
   zu dreimal mit kurzer Verzögerung (500 ms, 1000 ms), bevor es endgültig
   aufgibt – deckt genau die transienten Fälle ab, die einen manuellen
   zweiten Versuch bisher "gefixt" haben.
2. Schlagen alle Versuche fehl (oder wirft `bootstrapApplication` selbst),
   rendert `main.ts` eine minimale, gerahmte Fallback-Meldung
   (`renderBootstrapErrorFallback()`) direkt per DOM/Inline-Styles statt
   nichts zu tun – bewusste Ausnahme von "Texte immer über i18n"
   (`00-general.mdc`): Transloco kann hier naturgemäß nicht laufen, weil
   Angular nie gestartet ist. Zweisprachig (DE/EN) hart codiert, kein
   Freitext-Wildwuchs.

**Konsequenz:** Kein Kunde/Tester sieht mehr eine dauerhaft leere weiße
Seite ohne jede Erklärung – entweder erholt sich der Start selbst
(Retry) oder es gibt einen sichtbaren "Neu laden"-Button.

**Umsetzung (23.08.):** `core/runtime-config.ts` (Retry-Loop +
`runtime-config.spec.ts`-Tests dafür), `main.ts`
(`renderBootstrapErrorFallback()`).

## ADR-17: Zentraler App-Katalog in PostgreSQL (Prisma) – die DB ist die einzige Wahrheit

**Kontext:** Bis hierhin lag der App-Katalog als `konfiguration.json` im
Frontend-Bundle. Änderungen in den Einstellungen landeten pro Browser in
`localStorage` (ADR-1, ADR-4). Folge: Jeder Browser sah einen anderen
Katalog, neue Apps erschienen erst nach „Auf Standard zurücksetzen“, und ein
Administrator konnte den Katalog nicht zentral für alle pflegen.

**Entscheidung:**
1. `app-hub-backend` bekommt seine erste eigene Datenbank: PostgreSQL 16 mit
   **Prisma 7** (`@prisma/adapter-pg`, Schema in `backend/prisma/schema.prisma`,
   Tabelle `hub_apps`). Migrationen laufen beim Containerstart per
   `prisma migrate deploy` (`docker-entrypoint*.sh`).
2. `GET /hub-apps` lesen alle eingeloggten Benutzer, `PUT /hub-apps` nur die
   Rolle `Administrator`. Der PUT ersetzt den gesamten Katalog transaktional:
   Upsert nach ID, `sortOrder` = Position im Array, fehlende IDs werden gelöscht.
3. Im Frontend speichert `localStorage` nur noch **persönliche Präferenzen**
   (`{ order, disabledIds }`, Key `app-hub-personal-preferences`), niemals
   Katalog-Inhalte. Nicht-Admins sehen Name, URL und Icon schreibgeschützt.
4. `frontend/src/assets/konfiguration.json` ist nur noch **Seed-Quelle** für den
   Erstbestand: `npm run seed:hub-apps` in `backend/` (vom Host aus, mit
   `DATABASE_URL` auf die Ziel-DB). Der Seed ist ein idempotenter Upsert und
   **überschreibt Admin-Änderungen** an denselben IDs.
5. Live-URLs aus der Cluster-Discovery (`GET /hub-catalog-urls`) überlagern die
   gespeicherten URLs nur zur Anzeige, sie werden nicht zurückgeschrieben.

**Konsequenz:** Ein Katalog für alle Benutzer und Geräte. Eine neue App-Card
braucht in jedem bereits deployten Cluster einen `PUT /hub-apps` durch einen
Administrator oder einen Seed-Lauf gegen dessen DB.

**Cluster-Betrieb (23.10.):** Helm-Chart `helm/ai-app-hub-postgres` (PostgreSQL 16,
eine Replica, PVC mit `helm.sh/resource-policy: keep`). Die Deploy-Workflows rollen
Postgres vor dem Backend aus und übergeben `DATABASE_URL` als Secret. Danach läuft
`seed:hub-apps --if-empty` per Port-Forward: Eine neue Umgebung bekommt den
Startbestand, eine befüllte DB bleibt unangetastet. Prod hat eine eigene DB mit
eigenem Passwort (GitHub-Environment-Secret `POSTGRES_PASSWORD`), der Katalog wird
nicht aus Test kopiert. Backups der Cluster-DB sind noch nicht eingerichtet.

Im IAM-Zielbild werden aus Katalog-Einträgen die „Apps & Lizenzen“
(Entitlements je Organisation, IAM-Konzept §15) – das Katalogmodell muss
dann um den Organisationsbezug erweitert werden.

**Umsetzung (27.08.):** `backend/prisma/` (Schema + Migration
`20260827062619_add_hub_apps`), `backend/src/prisma/`, `backend/src/hub-apps/`,
`backend/scripts/seed-hub-apps.ts`, `docker-compose.yml` (Service `postgres`),
Frontend `core/models/app-config.model.ts`, `core/services/config.service.ts`,
`features/settings/settings-page.component.ts`.

## ADR-18: Axora IAM-Konzept v1.0 als verbindliches Zielbild – Keycloak authentifiziert, Axora IAM autorisiert, App Hub wird IAM-Admin-Frontend

**Kontext:** Bisher war Microsoft Entra ID der Plattform-Standard
(`platform-architecture.mdc`, ADR-2/6/7/8/12/14), Keycloak war ausdrücklich
ausgeschlossen. Das Konzept
`docs/konzepte/axora-iam-konzept-v1.0.md` (Stand 23.10.2026) legt die
Plattform neu fest: cloudneutral (Azure, AWS, On-Prem), Kunden mit eigenem
führenden Verzeichnis (Entra, Okta, AD), B2B-SSO, QR-Einladungen und
B2C-Gastkonten.

**Entscheidung:**
1. **Keycloak** (selbst betrieben, Operator, Version ≥ 26.8.x gepinnt) ist die
   Identity Engine: Login, SSO, MFA/Passkeys, Föderation, Token-Signatur.
2. **Axora IAM** (eigenständiger NestJS-Dienst mit eigener Prisma-DB) ist die
   Autorisierung: Principals, Organisationen, Mitgliedschaften, Gruppen,
   Rollen, Permissions (`app.resource.action`), Entitlements, Resource Grants,
   Einladungen, Gast-Sessions, Audit. API unter `/api/iam/v1`, geteilte Pakete
   `@axora/iam-contracts` und `@axora/iam-nestjs`.
3. **Browser-Apps nutzen ein BFF**: Authorization Code + PKCE serverseitig,
   Tokens bleiben im Backend, der Browser bekommt nur ein
   `Secure; HttpOnly`-Session-Cookie. **Verboten:** Implicit Flow, ROPC,
   Refresh Tokens im `localStorage`, weitreichende Access Tokens im Browser,
   Wildcard-Redirect-URIs.
4. **`ai-app-hub` wird das Admin-Frontend von Axora IAM** (IAM-Konzept §15) und
   greift nie direkt auf die Keycloak-Admin-API zu.
5. **Übergangsregel:** Der bestehende Entra/MSAL/Graph/ROPC-Code läuft weiter,
   bis die jeweilige Migration umgesetzt ist. Er bekommt keine neuen Features
   mehr. Neue Auth- und Berechtigungsarbeit folgt ausschließlich dem
   IAM-Konzept.

**Konsequenz:** ADR-2, -6, -7, -8 und -14 sind im Zielbild abgelöst. ADR-12
(ROPC) widerspricht dem Konzept direkt und braucht vor dem B2B-Go-Live einen
Ersatz. ADR-9 bleibt für die Infrastruktur gültig, das IAM-Mandantenmodell
ist dort offen. Die Cursor-Rules (`platform-architecture.mdc`, `iam.mdc`)
sind auf das Konzept umgestellt. Die acht offenen Konzept-ADRs (§23) und die
Plattform-ADRs 001–005 (Phase 0) werden im Plattform-Repository entschieden,
nicht hier.

**Nächste Schritte für dieses Repo:** Ablöse-ADR für den Tablet-Login
(ADR-12), BFF-Umbau von `app-hub-backend` (sobald `@axora/iam-nestjs` und ein
Keycloak-Realm bereitstehen), App-Hub-Admin-Module gemäß IAM-Konzept §15.

## ADR-19: Keycloak-Login über das Backend als BFF, umschaltbar per `AUTH_MODE`

**Kontext:** ADR-18 macht Keycloak + BFF zum Zielbild, der Code meldete aber
weiterhin nur über Entra/MSAL an. Lokal (`https://localhost:6054`) war damit
gar keine Anmeldung möglich, weil die Dev-URL in Entra nicht registriert ist.
Axora IAM (`/api/iam/v1`) und das Plattform-Repository mit der
Keycloak-Konfiguration existieren noch nicht.

**Entscheidung:**

1. **`AUTH_MODE`** (`entra` | `keycloak`) in Backend und Frontend
   (Runtime-Config). Ohne Angabe gilt `entra`, damit bestehende Cluster ohne
   neue Helm-Werte unverändert laufen. Docker Compose setzt `keycloak`.
2. **BFF im `app-hub-backend`** (`src/auth/bff/`, `openid-client`):
   Authorization Code + PKCE (S256) mit vertraulichem Client
   `ai-app-hub-bff`; `state`, `nonce`, `iss` und ID-Token werden geprüft.
   Routen: `GET /auth/login`, `GET /auth/callback`, `GET /auth/session`,
   `POST /auth/logout`.
3. **Sitzungen in der Hub-DB** (`auth_sessions`, `auth_login_transactions`).
   Der Browser bekommt nur `__Host-hub_session` (`Secure; HttpOnly;
   SameSite=Strict`); in der DB liegt nur der SHA-256-Hash des Cookie-Werts.
   Absolute Laufzeit 10 h, Leerlauf 1 h (wie die Realm-Einstellungen).
   Tokens verlassen das Backend nie.
4. **CSRF:** Schreibende Requests brauchen das CSRF-Token der Sitzung im
   Header `X-CSRF-Token` und, falls vorhanden, `Origin` = `FRONTEND_URL`.
5. **Übergangs-Autorisierung:** Bis Axora IAM existiert, kommen die Rollen
   aus den Client-Rollen von `ai-app-hub-bff` (Claim `roles`, Werte
   `Administrator`/`User`). Ohne eine dieser Rollen endet der Login mit
   `not_entitled` (Default Deny). **Abgelöst durch ADR-20** (Rechte aus
   Axora IAM); die Client-Rollen sind aus dem Dev-Realm entfernt.
6. **Dev-Realm als Code in diesem Repo** (`infra/keycloak/dev/axora-realm.json`,
   Import beim Start von `quay.io/keycloak/keycloak:26.8` in Compose).
   Secrets kommen als `${ENV}`-Platzhalter aus der `.env`. Default-Admin
   `admin@axora.local` mit beiden Client-Rollen. Abweichung von
   `platform-architecture.mdc` (Keycloak-Konfiguration gehört ins
   Plattform-Repo) – bewusst nur für die lokale Entwicklung, wird beim
   Aufbau des Plattform-Repos dorthin verschoben.
7. **Frontend:** `AuthService` ist eine abstrakte Fassade;
   `MsalAuthService` (Bestand) oder `BffAuthService` wird in
   `createAppConfig` nach `authMode` gebunden. Im Keycloak-Modus gibt es kein
   MSAL, keinen Ausweis-/PIN-Login (ROPC, ADR-12) und keine Graph-
   Benutzerverwaltung (ADR-6).
8. **Keine eigene Login-Seite im Keycloak-Modus:** `authGuard` leitet ohne
   Sitzung direkt zu Keycloak weiter (Top-Level-Redirect mit `returnTo`).
   `/login` zeigt nur noch Fehler aus dem Callback (`?error=`) mit
   „Erneut anmelden“; ohne Fehler (z. B. nach dem Logout) leitet sie sofort
   weiter.
9. **Login-Theme `axora`** (`infra/keycloak/themes/axora/`, Parent
   `keycloak.v2`): Login-Card im Stil von `ai-axora-portal` (Tokens 1:1,
   dunkel). Kopfzeile mit Axora-Logo, App-Glyph und App-Name. Die App wählt
   ihr Branding über das Client-Attribut `axora.brand.app` (z. B.
   `ai-app-hub`); dazu gehören `img/apps/<slug>/glyph.svg`, `icon.svg` und
   ein Farbblock `.axora-app--<slug>` in `css/axora.css`. Ohne Attribut gilt
   Axora-Orange. Wie der Realm wandert das Theme später ins Plattform-Repo.

**Konsequenz:** Lokal läuft die Anmeldung nach dem Zielbild. Cluster bleiben
bei `entra`, bis dort ein Keycloak-Realm betrieben wird (`deployment.mdc`);
für `keycloak` braucht das Backend dann `FRONTEND_URL` und `OIDC_*`.
Offen: Axora-IAM-Anbindung statt Token-Rollen, Benutzerverwaltung über IAM,
Ersatz für den Tablet-Login, Back-Channel-Logout von Keycloak.

## ADR-20: Rechte und Verwaltung über Axora IAM, Tokens verschlüsselt in der BFF-Sitzung

**Kontext:** ADR-19 hat den Login auf Keycloak umgestellt, die Rechte kamen
aber noch aus Client-Rollen im Token. Laut ADR-18 entscheidet Axora IAM über
Organisationen, Rollen und Rechte, und der Hub ist deren Verwaltungsoberfläche.
Die erste Ausbaustufe von `axora-iam-api` liegt jetzt im Plattform-Repository
`axora-platform` (dort ADR-0001).

**Entscheidung:**

1. **Entitlement beim Login aus der IAM:** Nach dem Code-Tausch ruft das BFF
   `GET /api/iam/v1/me` mit dem Access-Token des Nutzers auf. Eine Sitzung gibt
   es nur bei aktiver Mitgliedschaft, gültigem Entitlement für `ai-app-hub`
   und `hub.catalog.read` (Default Deny). IAM nicht erreichbar → `unavailable`
   (fail closed); Principal unbekannt oder gesperrt → `not_entitled`.
   Bei mehreren Organisationen gilt vorerst die erste passende (nach Name);
   ein Organisationswechsel kommt später.
2. **Abgeleitete Hub-Rollen:** `hub.catalog.manage` → `Administrator`, sonst
   `User`. Die bestehenden `@Roles(...)`-Prüfungen bleiben dadurch unverändert.
   Die Sitzung hält zusätzlich Organisation und die Permissions `hub.*`/`iam.*`;
   `GET /auth/session` liefert sie dem Frontend nur zur Anzeige.
3. **Tokens in der Sitzung, verschlüsselt:** Access- und Refresh-Token liegen
   AES-256-GCM-verschlüsselt in `auth_sessions` (Schlüssel `SESSION_TOKEN_KEY`,
   32 Byte base64, Format `v1.<iv>.<tag>.<ciphertext>`). Sie verlassen das
   Backend nur in Richtung IAM. Bestehende Sitzungen wurden bei der Migration
   beendet.
4. **Sitzung aktuell halten** (`SessionAccessService`): Das Access-Token wird
   30 s vor Ablauf erneuert. Die IAM-Rechte werden höchstens alle 30 s neu
   abgefragt (Konzept: kurze Caches). Lehnt Keycloak den Refresh ab oder
   entzieht die IAM den Zugriff, endet die Sitzung (401). Ist Keycloak oder
   die IAM nicht erreichbar, wird der Request mit 503 abgelehnt, die Sitzung
   bleibt bestehen. Der Logout nutzt nur die Cookie-/CSRF-Prüfung
   (`SessionCookieGuard`) und funktioniert deshalb auch ohne IAM.
5. **IAM-Proxy `/iam/v1/*`:** Die Verwaltungsseiten rufen nur das Hub-Backend
   auf (Cookie + CSRF). Das Backend hängt das Access-Token an und reicht
   Antwort und Problem Details unverändert durch. Erlaubt sind nur Pfade aus
   `[A-Za-z0-9_-]`-Segmenten (kein `..`, keine kodierten Zeichen) und die
   Methoden GET/POST/PUT/PATCH/DELETE. Autorisierung und Mandantenprüfung
   macht ausschließlich die IAM. Ein generischer Proxy statt einzelner
   Endpunkte, weil der Hub die IAM-Verwaltung nur darstellt und keine eigene
   Logik dazu hat.
6. **Verwaltungsoberfläche:** Einstellungen → Benutzer (suchen, per E-Mail
   einladen, sperren/entsperren), Gruppen (anlegen, löschen, Mitglieder,
   Gruppenrollen), Rollen & Rechte (Katalog, Zuweisungen an Personen oder
   Gruppen). Die Tabs erscheinen je nach IAM-Permission. Im Entra-Modus bleibt
   die Graph-Benutzerverwaltung (ADR-6) unverändert.
7. **Einladung:** Die IAM legt den Keycloak-Benutzer über ihren
   Service-Account `axora-iam-api` an (nur `view-/query-/manage-users`) und
   lässt Keycloak die Mail „E-Mail bestätigen + Passwort setzen“ senden
   (Link 72 h gültig, Rücksprung zum Hub). Lokal fängt Mailpit die Mails ab
   (http://localhost:6060). Der Browser spricht nie mit der
   Keycloak-Admin-API.
8. **Dev-Realm:** `ai-app-hub-bff` bekommt einen Audience-Mapper auf
   `axora-iam-api`; die Client-Rollen `Administrator`/`User` und ihr Mapper
   sind entfernt. Neu: Client `axora-iam-api` (nur Service-Account), SMTP auf
   Mailpit. Der Realm bleibt vorerst in diesem Repo (siehe ADR-19 Punkt 6).

**Konsequenz:** Rechte werden an einer Stelle gepflegt und wirken nach
spätestens 30 s im Hub. Lokal muss `axora-platform` laufen (Start nach dem
Hub, gemeinsames Docker-Netz `ai-app-hub_default`). Neue ENV-Variablen im
Backend: `IAM_API_URL`, `SESSION_TOKEN_KEY` (nur `AUTH_MODE=keycloak`). Cluster
bleiben bei `entra`. Offen: Organisationswechsel, Audit-Ansicht,
Back-Channel-Logout, Verwaltung organisationseigener Rollen.

## ADR-21: Keycloak-Login mit E-Mail + Passwort und E-Mail-OTP, Passkeys als Option

**Kontext:** Bisher reichten Benutzername oder E-Mail plus Passwort. Gewünscht
ist ein zweiter Faktor als 6-stelliger Code. Eine Authenticator-App kommt nicht
für alle Benutzer in Frage (keine App für Windows-Desktops ab Werk, nicht jeder
nutzt ein Firmenhandy). Keycloak 26 bringt TOTP und Passkeys mit, aber keinen
E-Mail-OTP.

**Entscheidung:**

1. **E-Mail ist der Benutzername** (`registrationEmailAsUsername`). Die
   Login-Seite fragt nur „E-Mail“ und „Passwort“ ab. Die IAM legt eingeladene
   Benutzer ohnehin mit der E-Mail als Benutzernamen an. Der Dev-Admin heißt
   jetzt `joergbeicht@outlook.de` (IAM-Seed `SEED_ADMIN_USERNAME`).
2. **E-Mail-OTP als Pflicht für alle**, über die Erweiterung
   [`mesutpiskin/keycloak-2fa-email-authenticator`](https://github.com/mesutpiskin/keycloak-2fa-email-authenticator)
   (Apache 2.0), Schritt „Email OTP (No Enrollment)“: jeder Benutzer mit
   E-Mail bekommt den Code ohne vorherige Einrichtung. Einstellungen: 6
   Stellen, 5 Minuten gültig, 5 Fehlversuche, 30 s bis zum erneuten Senden,
   maskierte Adresse im Formular, Versand über das Realm-SMTP (siehe
   ADR-22). Benutzer ohne E-Mail können sich nicht anmelden.
3. **Passkeys als Option** (Windows Hello, Touch ID, Handy, Sicherheitsschlüssel):
   im Realm aktiviert (`webAuthnPolicyPasswordlessPasskeysEnabled`, Mediation
   `conditional`). Die Login-Seite zeigt „Anmelden mit Passkey“; ein Passkey
   ersetzt Passwort **und** E-Mail-OTP, weil er selbst zwei Faktoren vereint
   (Gerät + Biometrie/PIN). Benutzer richten ihn in der Keycloak-Kontoverwaltung
   ein; der Hub verlinkt sie im Benutzermenü („Passkey einrichten“, neuer Tab).
   Die Adresse liefert das BFF in `GET /auth/session` (`accountSecurityUrl`).
4. **Browser-Flow `axora browser`:** Cookie (SSO) **oder** Formular-Teilflow.
   Darin: „Username Password Form“, danach der bedingte Teilflow mit
   „Condition - credential“ (nur wenn nicht per Passkey angemeldet) und
   „Email OTP (No Enrollment)“.
5. **Eigenes Keycloak-Image** (`infra/keycloak/Dockerfile`): Basis
   `keycloak:26.8.1`, Erweiterung `v26.7.2-KC26.8.0` per `ADD --checksum`
   gepinnt. Die Erweiterung nutzt interne Keycloak-SPIs (Warnung
   `KC-SERVICES0047` beim Start); bei jedem Keycloak-Update muss der passende
   Build mitgezogen und der Login einmal durchgetestet werden.

**Abgewogen:** TOTP per App (eingebaut, aber nicht für alle nutzbar);
E-Mail-OTP ist der schwächste zweite Faktor, weil er am Postfach hängt –
deshalb Passkeys als stärkere und bequemere Alternative. Eine selbst
geschriebene Erweiterung wäre mehr Pflegeaufwand als eine gepinnte,
gepflegte Fremderweiterung.

**Konsequenz:** Jede Anmeldung ohne Passkey verschickt eine Mail; das Realm-
SMTP muss in jeder Umgebung zuverlässig funktionieren. Realm-Änderungen
greifen lokal erst nach dem Keycloak-Reset (siehe `AGENTS.md`). Für einen
Cluster-Keycloak braucht es dasselbe Image. Offen: Wiederherstellung bei
verlorenem Postfach-Zugang (Admin).

## ADR-22: Keycloak-Mails über den SMTP-Eingang von `send-mail-with-azure`

**Kontext:** Seit ADR-21 verschickt jede Anmeldung ohne Passkey eine Mail,
dazu kommen die Einladungen aus der IAM (ADR-20). Bisher fing Mailpit alles
ab; echte Benutzer bekamen nichts. Plattformstandard für Login-, OTP- und
Einladungsmails ist `send-mail-with-azure` (Microsoft Graph, Absender
`SENDER_ADDRESS`). Keycloak kann aber nur SMTP, der Dienst nur HTTP.

**Entscheidung:**

1. `send-mail-with-azure` bekommt einen **SMTP-Eingang** (`smtp_intake.py`,
   `aiosmtpd`) als zweiten Compose-Dienst `smtp-intake` aus demselben Image.
   Er nimmt Mails ohne Anmeldung an und reicht sie pro Empfänger über
   dieselbe Graph-Funktion weiter wie `POST /send-email`. HTML hat Vorrang
   vor Klartext (Graph `contentType: HTML`). Schlägt Graph fehl, antwortet
   er mit `451`, damit der Absender den Fehler sieht. Inhalte werden nicht
   geloggt, weil darin OTP-Codes stehen.
2. **Nur lokal erreichbar:** Der Port ist nur auf `127.0.0.1:6004` des Hosts
   veröffentlicht. Keycloak erreicht ihn über `host.docker.internal`, wie die
   anderen Apps die HTTP-API auf Port 6003. Keine gemeinsamen Docker-Netze,
   damit der Hub auch ohne den Mail-Dienst startet.
3. Der Realm liest Host und Port aus `KEYCLOAK_SMTP_HOST` /
   `KEYCLOAK_SMTP_PORT` (Standard `host.docker.internal:6004`). Mailpit
   bleibt als Mailfalle: `KEYCLOAK_SMTP_HOST=mailpit`, `KEYCLOAK_SMTP_PORT=1025`.
4. Absender ist immer `SENDER_ADDRESS` des Mail-Diensts; der From-Eintrag im
   Realm (`no-reply@axora.local`) wird von Graph ignoriert.

**Abgewogen:** XOAUTH2-SMTP direkt von Keycloak zu Office 365 (neue
Azure-Konfiguration pro Umgebung, umgeht den Plattformdienst); ein eigener
Keycloak-Email-Provider gegen die HTTP-API (Java-Erweiterung, mehr Pflege);
Mailpit beibehalten (keine echte Zustellung).

**Konsequenz:** Ohne laufendes `send-mail-with-azure` scheitert jede
Anmeldung ohne Passkey am OTP-Versand. Der SMTP-Eingang hat keine
Anmeldung; er darf nie öffentlich oder in geteilten Netzen erreichbar sein.
Für einen Cluster-Keycloak braucht es denselben Eingang als internen
Service. **Bekanntes Risiko:** Die Absender-Domain `confessio-management.de`
hat zwei SPF-Einträge, kein DKIM und kein DMARC (geprüft am 23.10.2026).
Microsoft-Consumer-Postfächer (`outlook.*`, `hotmail.*`) verwerfen solche
Mails laut `send-mail-with-azure/docs/HANDOFF.md` lautlos, obwohl Graph sie
annimmt. Das DNS muss vor dem produktiven Einsatz korrigiert werden.
