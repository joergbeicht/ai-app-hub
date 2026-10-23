# Dokumentation – ai-app-hub

| Dokument | Inhalt | Status |
|---|---|---|
| [`konzepte/axora-iam-konzept-v1.0.md`](konzepte/axora-iam-konzept-v1.0.md) | Axora Identity & Access Management: Keycloak + Axora IAM, BFF, Organisationen, Rollen, Einladungen, Gastkonten, Roadmap, Abnahmekriterien | **verbindliches Zielbild** (ADR-18), unverändert übernommen |
| [`ARCHITEKTUR-ENTSCHEIDUNGEN.md`](ARCHITEKTUR-ENTSCHEIDUNGEN.md) | ADR-1 bis ADR-18 mit Statusübersicht | aktuell |
| [`LEISTUNGSBESCHREIBUNG.md`](LEISTUNGSBESCHREIBUNG.md) | Business-Sicht: was der Hub heute kann und wohin er sich entwickelt | aktuell |
| [`archiv/`](archiv/) | überholte Dokumente (MVP-Checkliste, alte Browser-Tools-Anleitung) | nur historisch |

Weitere Einstiege:

- `../README.md` – Start, Ports, Skripte, Betrieb
- `../AGENTS.md` – Arbeitsanweisungen für Cursor-Agents
- `../.cursor/rules/` – verbindliche Coding- und Architektur-Rules
- `../helm/README.md`, `../infra/bicep/README.md` – Deployment und Infrastruktur

## Konventionen

- Dokumentation auf Deutsch, Code und Bezeichner auf Englisch.
- ADR-Nummern sind stabil und werden im Code zitiert. Überholte ADRs bekommen einen Status, sie werden weder gelöscht noch umnummeriert.
- Konzepte unter `konzepte/` werden versioniert abgelegt (`<name>-v<major>.<minor>.md`). Eine neue Version ist eine neue Datei, die alte wandert ins Archiv.
- Abweichungen von den Rules werden als ADR dokumentiert, nie stillschweigend umgesetzt.
