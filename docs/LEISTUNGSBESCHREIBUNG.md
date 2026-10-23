# Leistungsbeschreibung: Axora AI App Hub

**Dokumenttyp:** Business-orientierte Beschreibung des Systems  
**Zielgruppe:** Fachbereiche, Entscheider, Partner  
**Stand:** 23.10.2026  
**Projekt:** ai-app-hub

---

## Projektziel

Der App Hub ist die **zentrale Einstiegsseite** für alle Axora-Apps: alle Anwendungen als Cards auf einer Seite – ein Klick öffnet die gewählte App in einem neuen Tab. Eine Adresse, alle Apps, keine verstreuten Bookmarks.

Mit dem **Axora IAM-Konzept v1.0** (`docs/konzepte/axora-iam-konzept-v1.0.md`) bekommt der Hub eine zweite Rolle: Er wird das **Verwaltungsfrontend für Benutzer, Gruppen, Rollen, App-Lizenzen und Einladungen** der gesamten Plattform.

---

## Was der App Hub heute leistet

### Startseite

- **Card-Grid** mit allen freigegebenen Apps: Icon, Name, Kurzbeschreibung, Ziel-URL.
- **Klick auf eine Card** öffnet die App in einem neuen Tab, der Hub bleibt offen.
- **Responsive / Mobile First**, installierbar als PWA (auch auf Tablets).
- **Mehrsprachig:** Deutsch (Standard), Englisch, Spanisch, Französisch, Türkisch, Italienisch – UI und App-Texte wechseln gemeinsam.

### Zentraler App-Katalog (ADR-17)

- Der Katalog liegt **zentral in der Datenbank** des App Hub und ist für alle Benutzer und Geräte gleich.
- **Administratoren** pflegen ihn in den Einstellungen: Apps anlegen, bearbeiten (Name und Beschreibung je Sprache, URL, Icon), entfernen, Reihenfolge festlegen.
- **Alle anderen Benutzer** sehen die Inhalte schreibgeschützt und können sich die Übersicht **persönlich** anpassen: eigene Reihenfolge, Apps ausblenden, „Eigene Anpassungen zurücksetzen“. Diese persönlichen Einstellungen gelten nur im jeweiligen Browser.
- In einem Kunden-Cluster ersetzt der Hub die hinterlegte URL automatisch durch die tatsächlich erreichbare Adresse der dort laufenden App.

### Anmeldung und Benutzerverwaltung (heutiger Stand)

- Anmeldung über **Microsoft Entra ID**; auf Tablets zusätzlich per **Mitarbeiterausweis + PIN**.
- **Benutzerverwaltung** im Hub: Administratoren weisen Rollen (`User`, `Administrator`, `Guest`) zu, ohne das Azure-Portal öffnen zu müssen.

Dieser Stand wird mit dem IAM-Konzept abgelöst (siehe unten). Bis zur Umstellung bleibt er unverändert in Betrieb.

---

## Zielbild nach IAM-Konzept v1.0 (ADR-18)

| Bereich | Heute | Zielbild |
|---|---|---|
| Anmeldung | Microsoft Entra ID direkt in jeder App | **Keycloak** als zentrale Anmeldung; Entra ID, Okta oder AD des Kunden werden angebunden |
| Wechsel zwischen Apps | Silent-SSO, wenn der Browser es zulässt | ohne erneute Eingabe von Zugangsdaten, solange eine gültige Sitzung besteht |
| Rechte | Rollen pro App in Entra ID | **Axora IAM**: Organisationen, Gruppen, Rollen je App, Lizenzen, Freigaben auf einzelne Fachobjekte |
| Tablet-Login | Ausweis + PIN (technisch über Passwort-Grant) | sichere, gerätegebundene Sitzung nach einmaliger Aktivierung (Lösung wird noch entschieden) |
| Externe Personen | – | Einladung per QR-Code (einmalig, kein Dauer-Zugang) |
| Privatkunden | – | eingeschränktes Gastkonto, später ohne Datenverlust aufwertbar |
| Betrieb | Azure (AKS) | Azure, AWS oder On-Premises |

### Der App Hub als Verwaltungsoberfläche (IAM-Konzept §15)

Organisationen · Benutzer · Gruppen · Rollen & Rechte · Apps & Lizenzen · Identity Provider · Einladungen & externe Zugriffe · Sessions & Sicherheit · Audit & Compliance · Service Accounts.

Ein Organisations-Administrator verwaltet ausschließlich seine eigene Organisation und kann sich keine höheren Rechte verschaffen.

---

## Technologie

| Bereich | Technologie |
|---|---|
| Frontend | Angular (Standalone, Signals), Angular Material, Transloco |
| Backend | NestJS (`app-hub-backend`) |
| Datenbank | PostgreSQL 16 mit Prisma |
| Anmeldung heute | Microsoft Entra ID (MSAL) |
| Anmeldung Ziel | Keycloak + Axora IAM, Backend-for-Frontend mit Session-Cookie |
| Betrieb | Docker, Kubernetes (Helm), GitHub Actions; Referenzcluster `confessio-test` auf Azure AKS |

---

## Wer nutzt den App Hub?

- **Mitarbeitende:** täglicher Einstieg in Berichte, Analytics, Formulare, Service, Steuerung und weitere Apps.
- **Administratoren beim Kunden:** pflegen App-Katalog und Benutzer, künftig auch Gruppen, Rollen und Lizenzen.
- **Entscheider / Demos:** zentrale Übersicht der Plattform.
- **Betrieb:** neue Apps sichtbar machen oder URLs ändern, ohne Code-Deployment.
