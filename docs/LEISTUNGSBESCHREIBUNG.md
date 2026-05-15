# Leistungsbeschreibung: App Hub

**Dokumenttyp:** Business-orientierte Beschreibung des Systems  
**Zielgruppe:** Fachbereiche, Entscheider, Partner  
**Stand:** Februar 2026  
**Projekt:** ai-app-hub

---

## Projektziel

Der App Hub ist die **zentrale Einstiegsseite** für alle Apps der Plattform: Eine Übersicht aller Anwendungen als Cards – ein Klick öffnet die gewählte App in einem neuen Tab. Keine verstreuten Bookmarks, keine getrennten Ports im Kopf; eine Adresse, alle Apps.

---

## Schritt 1: Wichtigster Einstieg – die Konfiguration

Der App Hub hat kein eigenes Backend-API. Der zentrale Einstieg für die Geschäftslogik ist die **Konfigurationsdatei**, die das Frontend beim Start lädt:

**Datei:** `frontend/src/assets/konfiguration.json`

- **Bedeutung:** Definiert, welche Apps angezeigt werden – pro App: Name, Kurzbeschreibung, Ziel-URL und Icon.
- **Struktur:** Liste von App-Einträgen mit `id`, `name`, `description`, `url`, `iconType` (z. B. `mat-icon` oder `image`) und `icon` (Icon-Name oder Bildpfad). Optional ein `defaultIcon` für den Fall, dass ein Icon fehlt.

Über diese Datei (oder die in den Einstellungen gespeicherte Variante in localStorage) steuert ihr, welche Apps im Hub erscheinen und wohin der Nutzer beim Klick geführt wird.

---

## Schritt 2: Response / Konfigurationsstruktur interpretieren

**Beispiel-Auszug aus konfiguration.json:**

```json
{
  "defaultIcon": "apps",
  "apps": [
    {
      "id": "ai-berichtgenerator",
      "name": "AI Berichtgenerator",
      "description": "Aus chronologischen Notizen professionelle Berichte erzeugen – KI-generiert, einheitlicher Stil, weniger manuelle Schreibtischarbeit.",
      "url": "http://localhost:4202/notes",
      "iconType": "mat-icon",
      "icon": "menu_book"
    },
    {
      "id": "ai-firmenwissen",
      "name": "AI Firmenwissen",
      "description": "Ihr intelligenter Wissens-Assistent: Richtlinien, Prozesse und Unternehmenswissen auf Abruf …",
      "url": "http://localhost:4200/chat",
      "iconType": "mat-icon",
      "icon": "psychology"
    }
  ]
}
```

| Feld | Bedeutung |
|------|-----------|
| **defaultIcon** | Fallback-Icon (z. B. Material `apps`), wenn für eine App kein Icon angegeben ist oder das Bild nicht geladen werden kann. |
| **apps** | Liste aller sichtbaren Apps. Jeder Eintrag = eine Card auf der Startseite. |
| **id** | Eindeutige Kennung der App (technisch, z. B. für Einstellungen). |
| **name** | Anzeigename auf der Card. |
| **description** | Kurzbeschreibung unter dem Namen – erklärt in einem Satz, wofür die App da ist. |
| **url** | Ziel-URL; Klick auf die Card öffnet diese URL in einem neuen Tab. |
| **iconType** | `mat-icon` = Material-Icon-Name in `icon`; `image` = Bild (Pfad oder URL in `icon`). |
| **icon** | Material-Icon-Name (z. B. `menu_book`, `insights`) oder Bildpfad/URL. |

**Kurz:** Die Konfiguration beschreibt die komplette sichtbare App-Übersicht – welche Apps es gibt, wie sie heißen, was sie tun und wohin sie führen.

---

## Schritt 3: Was das System anhand dieser Konfiguration tut

1. **Startseite anzeigen**  
   Das Frontend lädt die Konfiguration (aus der Datei oder aus localStorage, falls in den Einstellungen gespeichert) und rendert pro Eintrag eine Card mit Icon, Name, Beschreibung und URL.

2. **Einheitlicher Einstieg**  
   Der Nutzer sieht alle verfügbaren Apps an einem Ort – Berichtgenerator, Analytics, Formulare, Flows, Data Hub, Firmenwissen, Liquiditätsmanagement, Event-/Time Machine usw. Kein Merken von Ports oder einzelnen URLs.

3. **Direkt in die App**  
   Klick auf eine Card → `window.open(url, '_blank')` – die gewählte App öffnet sich in einem neuen Tab. Der Hub bleibt im bisherigen Tab erhalten.

4. **Anpassung ohne Code-Änderung (Einstellungen)**  
   In den Einstellungen können Anwender mit Berechtigung Apps bearbeiten, hinzufügen oder entfernen. Gespeichert wird optional in localStorage; „Auf Standard zurücksetzen“ lädt wieder die ursprüngliche `konfiguration.json`.

**Kurz:** Der App Hub **bündelt die Sichtbarkeit und den Zugang** zu allen Plattform-Apps über eine Konfiguration und eine Oberfläche – zentral, übersichtlich, anpassbar.

---

## Schritt 4: Technologie-Stack, Integration, Stand

### Technologie-Stack

| Bereich | Technologie |
|---------|-------------|
| **Frontend** | Angular (Standalone), Angular Material, Signals, TypeScript |
| **Theme** | Custom Material Dark Theme (Referenz: ai-berichtgenerator) |
| **Konfiguration** | `konfiguration.json` (Assets), optional Persistenz in localStorage |
| **Laufzeit/Deployment** | Docker, Docker Compose; Production-Build mit nginx |
| **Port** | 6054 (Frontend) |

### Integration – wer nutzt den App Hub?

- **Mitarbeitende und Fachbereiche:** Täglicher Einstieg, um die richtige App (Berichte, Analytics, Formulare, Flows, WissensKI, etc.) zu öffnen.
- **Entscheider/Demos:** Zentrale Übersicht der Plattform-Komponenten; optional Pitch-Slide (z. B. `/pitch-audi`) für Präsentationen.
- **Betrieb:** Konfiguration über Datei oder Einstellungen, ohne Code-Deployment neue Apps sichtbar machen oder URLs anpassen.

### Aktueller Stand

| Feature | Status |
|--------|--------|
| Card-Grid (Startseite), responsive, Mobile First | ✅ produktiv |
| Konfiguration aus konfiguration.json, Config-Service (Signals) | ✅ produktiv |
| Einstellungen: Apps bearbeiten, hinzufügen, entfernen; localStorage; Zurücksetzen | ✅ produktiv |
| Icons: Material-Icon und Bild, Default bei Fehler | ✅ produktiv |
| Route /pitch-audi (Vollbild-Slide für Präsentationen) | ✅ produktiv |
| Docker First, Hotreload in der Entwicklung | ✅ produktiv |

---

## Schritt 5: Was leistet das Frontend für den Anwender?

### Startseite

- **Card-Grid:** Alle konfigurierten Apps als Karten mit Icon, Name, Kurzbeschreibung und URL.
- **Klick auf eine Card:** Öffnet die zugehörige App in einem neuen Tab; Hinweis „Öffnen in neuem Tab“.
- **Responsive:** Nutzbar auf Desktop und mobil (Mobile First).

### Einstellungen

- **Apps verwalten:** Bestehende Apps bearbeiten (Name, Beschreibung, URL, Icon), neue Apps anlegen, Apps entfernen.
- **Speichern:** Änderungen in localStorage ablegen (oder nur in der Session nutzen).
- **Auf Standard zurücksetzen:** Lädt wieder die ursprüngliche `konfiguration.json` und überschreibt die lokalen Anpassungen.

### Weitere Routen

- **/pitch-audi:** Vollbild-Slide für den AUDI-Pitch (Wissensdatenbasis, Plattform statt Ad-hoc-Agent) – für Präsentationen und Demos.

### Was der Anwender nicht tun muss

- Keine einzelnen URLs oder Ports merken.
- Keine manuelle Anpassung von Code, um eine neue App in der Übersicht zu haben (wenn die Konfiguration bzw. Einstellungen genutzt werden).

---

*Diese Leistungsbeschreibung beschreibt den App Hub in produktionsnaher Form. Die Konfiguration ist stabil; neue Apps werden über konfiguration.json oder die Einstellungen ergänzt.*
