# Browser-Tools aktivieren – damit der Agent das Frontend sehen kann

Damit ich (der Agent) das Frontend in Cursor mit den Browser-Tools ansehen und bedienen kann, müssen folgende Schritte erfüllt sein.

---

## 1. Browser-MCP in Cursor aktivieren

- **MCP-Server:** `cursor-ide-browser` (oder `cursor-browser-extension`, je nach Installation).
- In Cursor: **Einstellungen** → **MCP** (oder „Features“ / „Beta“) → prüfen, ob der Browser-MCP-Server eingetragen und **verbunden** ist.
- Wenn der Server fehlt: MCP-Erweiterung für den Browser installieren bzw. den Server in der Cursor-MCP-Konfiguration hinzufügen.

Ohne aktiven Browser-MCP sind die Browser-Tools in der Agent-Session nicht verfügbar (z. B. Meldung wie „Tool … not found“ oder leere Tool-Liste).

---

## 2. Frontend im Projekt starten

- Die App muss laufen (z. B. Dev-Server auf `http://localhost:PORT`).
- Typisch: `npm start`, `ng serve`, `docker-compose up` o. ä. – je nach Projekt.
- Port prüfen (z. B. in `package.json`, `angular.json` oder `docker-compose.yml`).

Ohne laufende App kann ich die Seite nicht laden und nicht „ansehen“.

---

## 3. So „sehe“ ich das Frontend – Ablauf

1. **Tabs prüfen**  
   Ich rufe `browser_tabs` mit `action: "list"` auf. Wenn bereits ein Tab mit eurer App-URL offen ist, nutze ich diesen.

2. **Falls kein passender Tab da ist**  
   Ich rufe `browser_navigate` mit der Frontend-URL auf (z. B. `http://localhost:6040` oder der Port eures Projekts). Dadurch wird die Seite im eingebetteten Browser geöffnet.

3. **Seite lesen und interagieren**  
   - `browser_lock` (damit während meiner Aktionen nichts versehentlich geändert wird)  
   - `browser_snapshot` – damit erhalte ich die Struktur der Seite und Referenzen (refs) für Links, Buttons, Eingabefelder.  
   - Danach kann ich klicken, scrollen, Formulare ausfüllen usw.  
   - Am Ende: `browser_unlock`.

**Wichtig:** Es muss mindestens ein Browser-Tab existieren. Ich kann einen Tab durch `browser_navigate` erzeugen, wenn vorher noch keiner da ist. Ohne verbundenen Browser-MCP funktioniert dieser Ablauf nicht.

---

## 4. Wenn es „in einem anderen Projekt“ nicht funktioniert

| Problem | Was prüfen / tun |
|--------|-------------------|
| **„Tool not found“ / keine Browser-Tools** | Browser-MCP in Cursor aktivieren und verbunden lassen; Cursor oder Composer ggf. neu starten; neuen Agent-Lauf starten. |
| **Kein Tab / leere Seite** | Einmal die App-URL im Cursor-Browser öffnen (z. B. `http://localhost:XXXX`) oder mich bitten, zu `http://localhost:XXXX` zu navigieren – und den **richtigen Port** nennen. |
| **Falscher Port** | Im anderen Projekt den tatsächlichen Dev-Port ermitteln (z. B. `package.json`, `angular.json`, `vite.config`, `docker-compose`) und mir die URL mit Port nennen, z. B.: „Frontend läuft auf http://localhost:4200“. |
| **Seite lädt nicht** | Sicherstellen, dass der Dev-Server im anderen Projekt wirklich läuft und von Cursor aus erreichbar ist (kein reines Netzwerk-/Firewall-Problem). |

---

## 5. Kurz-Checkliste für ein neues Projekt

- [ ] Browser-MCP in Cursor aktiv und verbunden  
- [ ] Frontend gestartet (richtiger Port)  
- [ ] URL bekannt (z. B. `http://localhost:4200`)  
- [ ] Optional: Im Cursor-Browser einmal die App-URL geöffnet  
- [ ] Bei weiterhin fehlenden Tools: Cursor/Composer neu starten oder neuen Agent-Chat starten  

Wenn das erledigt ist, kann ich das Frontend mit den Browser-Tools ansehen und das Vorgehen wie oben beschrieben durchführen.
