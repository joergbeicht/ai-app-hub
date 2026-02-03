# App Hub – Implementierungs-Checkliste

## ✅ Voraussetzungen (alles vorhanden)

### Anforderungen
- [x] App Hub: n Apps, je eine URL
- [x] Pro App eine Card; Klick → App in neuem Tab öffnen
- [x] Frontend: Angular, **responsive, Mobile First**
- [x] Card: App-Icon, Name, Beschreibung, URL
- [x] Settings-Menü: alle Card-Inhalte (1–4) konfigurierbar
- [x] Daten: **konfiguration.json**
- [x] Icons: **App-Icons aus den jeweiligen Apps** (Header/Favicon); bei Fehler **Default-Icon**

### Dev-Rules (00-core-standard.mdc)
- [x] Async/await, Clean Code, DRY
- [x] Docker First, Hotreload
- [x] **App Hub Ports:** Frontend **6054**, Backend **6055** (freie Ports – 6040/6041 von ai-analytics)
- [x] Signal First, Material First
- [x] Deutsch (Antworten, Kommentare, Commits)

### Custom Material Theme (Pflicht)
- [x] **Unser Custom Material Dark Theme verwenden** – kein generisches Material-Theme
- [x] Theme aus Referenz kopieren: `ai-berichtgenerator/frontend/src/theme/custom-theme.scss`
- [x] Im App Hub: z. B. `frontend/src/theme/custom-theme.scss` + in `styles`/`angular.json` einbinden
- [x] CSS Custom Properties (--primary-*, --bg-primary, --text-primary, etc.) und Material-Overrides (--mdc-*) nutzen

### Ports (App Hub – freie Ports)
| Port | Verwendung (andere Projekte) |
|------|------------------------------|
| 6040 | ai-analytics Frontend |
| 6041 | ai-analytics Backend |
| 6043 | ai-data-orchestration-hub Frontend |
| 6044 | ai-data-orchestration-hub Backend |
| 6048 | AI Orchestrator |
| 6049 | Communication Service (Formular-Generator) |
| 6050 | GCP Bucket CRUD (Formular-Generator) |
| 6051 | Claude-AI (ai-garden) |
| 6052 | ai-garden Frontend |
| 4202 | ai-berichtgenerator Frontend |
| 4203 | Formular-Generator Admin-Portal |
| 4301 | Pflege-Dokumentation Frontend |

**Freie Ports für App Hub:** **6054** (Frontend), **6055** (Backend, falls später).  
Alternativ **6042** (Frontend) – ebenfalls frei.

### Apps & URLs (Start-Konfiguration)
| App | URL |
|-----|-----|
| AI Berichtgenerator | http://localhost:4202/notes |
| AI Analytics | http://localhost:6040/ |
| Formular-Generator | http://localhost:4203/forms |
| Pflege-Dokumentation | http://localhost:4301/flows |
| AI Data Orchestration Hub | http://localhost:6043/workflows |

### Icons
- **Bild:** Favicons aus den Apps in `frontend/src/assets/app-icons/` kopieren (oder Pfad in Config)
- **Material Icon:** Name in Config (z. B. `insights`, `hub`, `account_tree`)
- **Default-Icon:** wenn Icon fehlt oder Fehler → ein Default (z. B. Material `apps` oder `default.svg`)

### Datenmodell konfiguration.json
```json
{
  "defaultIcon": "apps",
  "apps": [
    {
      "id": "string",
      "name": "string",
      "description": "string",
      "url": "string",
      "iconType": "image | mat-icon",
      "icon": "app-icons/xyz.svg | material-icon-name"
    }
  ]
}
```

### Meilensteine
1. **M1** Angular-Projekt, **Custom Material Theme** (custom-theme.scss aus Referenz) einbinden, Layout (Mobile First)
2. **M2** konfiguration.json + Config-Service (Signals), App-Card (Icon + Default, Name, Beschreibung, Klick → `window.open(url, '_blank')`)
3. **M3** Card-Grid, responsive, 5 Apps vorkonfiguriert
4. **M4** Settings: Apps bearbeiten/speichern (z. B. localStorage oder Backend)
5. **M5** Docker + docker-compose, Hotreload

---

## Offene Punkte (vor Start klären)

| Thema | Optionen | Empfehlung |
|------|----------|------------|
| ~~Port~~ | Freie Ports gesucht → **6054** (Frontend), **6055** (Backend) | ✅ Übernommen |
| Settings-Persistenz | A: nur assets/konfiguration.json (+ Download) B: localStorage C: kleines Backend | Start: A oder B; später C |
| Formular-Generator Icon | Kein Favicon im Repo gefunden; Icon im Header (4203) | Default-Icon oder Material `description` / `dynamic_form` bis Icon definiert |

---

**Fazit:** Ja – wir haben alles für die Implementierung. Die offenen Punkte sind nur Feinabstimmung (Port, Persistenz, ein Icon-Fallback).
