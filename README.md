# App Hub

Zentrale Übersicht aller Apps als Cards. Klick auf eine Card öffnet die jeweilige App in einem neuen Browser-Tab.

## Technologie

- **Docker First:** Entwicklung und Laufzeit bevorzugt mit Docker (laut Dev-Rules)
- **Frontend:** Angular (Standalone), Signal First, Material First
- **Theme:** Custom Material Dark Theme (Referenz: ai-berichtgenerator)
- **Port:** 6054 (Frontend)
- **Konfiguration:** `frontend/src/assets/konfiguration.json`; Einstellungen optional in localStorage

## Start (Docker First – empfohlen)

**Entwicklung (Hotreload):**
```bash
./start-docker.sh
```
oder aus dem Projektroot: `docker compose up --build`  
App: http://localhost:6054  
Änderungen an `frontend/src` (inkl. `konfiguration.json`) werden übernommen – Start immer aus dem Projektroot, damit der Volume-Mount stimmt.

**Production (Build + nginx):**
```bash
docker build -f frontend/Dockerfile frontend -t app-hub-frontend:latest
docker run -p 6054:80 app-hub-frontend:latest
```
App: http://localhost:6054

## Start (lokal, ohne Docker)

```bash
cd frontend
npm install
npm start
```

App: http://localhost:6054

## Struktur

- **Startseite:** Card-Grid mit allen konfigurierten Apps (responsive, Mobile First)
- **Einstellungen:** Apps bearbeiten, hinzufügen, entfernen; Speichern in localStorage; „Auf Standard zurücksetzen“ lädt wieder `konfiguration.json`
- **Card:** App-Icon (Bild oder Material-Icon), Name, Beschreibung, URL; Klick → `window.open(url, '_blank')`
- **Icons:** `iconType: "image"` mit Pfad (z. B. `app-icons/xyz.svg`) oder `iconType: "mat-icon"` mit Icon-Namen; bei Fehler wird das Default-Icon (`defaultIcon` in Config) angezeigt

## Konfiguration

Siehe `frontend/src/assets/konfiguration.json` und `docs/IMPLEMENTIERUNG-CHECKLISTE.md`.
