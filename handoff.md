# Project Handoff

**Last Updated:** 2026-03-27 15:38
**Project Path:** `/Users/dflagmei/.gemini/antigravity/scratch/brainstorm-tool`
**Git Branch:** main

---

## Aktueller Stand (Was wurde zuletzt fertiggestellt?)

- A15–A19: Kern-Architektur, Zone-relative Node-Platzierung, Imagen 3, Gemini Explain
- A20: Entfällt (durch A23 ersetzt)
- **A23**: Redesign Text Expansion & Frosted Dots (Option B: unten mittig, farblos, einfacher Link-Toggle)
- blast-progress.html komplett neu designed: "Nothing"-Stil, Dark/Light Mode Toggle
- Context Health Sticky Banner (FRESH WINDOW Button) implementiert
- Auto-Restart Watcher (`watch-server.sh`) für Dev-Server
- `/start` und `/finish` Workflows aktualisiert mit Context Health Regeln
- Umbenennung: "BLAST – Research Tool" → "Research Tool // BLAST Progress"
- Anti-FOUC Fix für flackerfreien Auto-Refresh (8s Intervall)

---

## Offene Tasks (nächster Start hier)

- **A21**: Root "+"-click generiert neue Cluster-Zonen
- **A22**: Imagen Stil-Matching (User muss Referenzbilder liefern)
- A24: Deep Integration of Source Linking (hover to preview snippet)

---

## Entscheidungen & Kontext (wichtig für den nächsten Agent)

- **Design:** "Nothing-inspired" — weiss, clean, keine Emojis, neon-gelb (#ccff00) Akzente
- **Frosted Dots:** Option B = unten mittig im Panel-Footer. Farblos (frosted glass), wie der Resizer im Blog-Inspo-Tool
- **Text Expansion:** Einfacher "More/Less"-Toggle-Link. KEIN Double-Click zum Expandieren.
- **Dots Funktion:** Dot 2 = Brief Explain, Dot 3 = Deep Explain (onExplain callback)
- **API:** Gemini 2.5 Flash für Research/Explain, Imagen 3 für Bildgenerierung
- **Bekannte Limitierungen:** Gemini API 503 sporadisch (externe API-Last)
- **State Management:** ReactFlow `onNodesChange`, `ViewModeContext` für Semantic Zoom
- **Image Style:** "Editorial Science-Magazine" Prompt in Imagen 3

---

## Lokale Server-Umgebung

- **Dev-Befehl:** `./watch-server.sh` (Auto-Restart Watcher — bevorzugt)
- **Fallback:** `npm run dev`
- **URL:** http://localhost:8080
- **Logs:** `/tmp/brainstorm-server.log`

---

## Fokus-Dateien (zuletzt bearbeitet)

- `src/features/graph/components/concept-node.tsx` — A23 startet hier
- `blast-progress.html` — Prozesstool
- `watch-server.sh` — Auto-Restart Watcher (neu)
- `_agents/workflows/finish.md` — Aktualisiert
- `_agents/workflows/start.md` — Aktualisiert

---

## Next Steps (im neuen Fenster sofort starten)

1. **A23 implementieren** in `concept-node.tsx`:
   - `ThreeDots`-Komponente: farblos frosted glass, im Footer zentriert (Option B)
   - Text Expansion: simpler klickbarer Link-Text "More / Less" ohne Double-Click
2. Auto-Restart Watcher starten: `nohup ./watch-server.sh > /tmp/brainstorm-server.log 2>&1 &`
3. Tool auf http://localhost:8080 öffnen und A23 visuell bestätigen
