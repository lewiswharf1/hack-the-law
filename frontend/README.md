# Scaffold — Frontend

React + Vite + Tailwind v4 prototype for the Scaffold legal argument-graph tool.
Built against `../CLAUDE.md` (spec) and `../DESIGN_SYSTEM.md` (visual design).

## Running

```bash
npm install
npm run dev      # http://localhost:5173
```

Login with the demo credentials (pre-filled): **admin / scaffold2026**.

## Status: mock-backed prototype

The UI is fully clickable today **without a backend**. All data comes from an
in-memory mock layer so you can visualise the whole flow:

```
Login → Cases list → New case → Select GDPR articles → Build graph (polled)
      → Case workspace: Overview · Argument Graph (+ evidence) · Documents
        (upload + polled analysis) · Gaps (resolve / flag)
```

### Architecture

| Path | Role |
|---|---|
| `src/api/client.ts` | **The only backend seam.** Exact `api.*` interface from CLAUDE.md §15.1, plus graph/document/evidence/gap methods. Mock-backed today; real `fetch` calls already present behind `USE_MOCKS`. |
| `src/api/mockData.ts` | The fake dataset (a worked GDPR Art. 82 case). Deleted once live. |
| `src/types/` | TS contracts mirroring the documented JSON shapes (CLAUDE.md §7). |
| `src/components/` | Design-system primitives (Button, Card, badges, Modal, Spinner) + app shell. |
| `src/pages/` | Routed screens: `Login`, `CasesList`, `CaseSetup`, `CaseWorkspace`. |
| `src/features/` | Workspace tabs: `CaseOverview`, `ArgumentGraph`, `DocumentsInbox`, `GapsPanel`. |

## Going live (when the FastAPI backend exists)

1. Start the backend on `http://localhost:8000` (see `../backend`).
2. Set `VITE_USE_MOCKS=false` (e.g. in a `.env` file), **or** flip the
   `USE_MOCKS` default in `src/api/client.ts`.
3. Every `api.*` method already contains the real request against the documented
   route — no component changes needed. Then delete `src/api/mockData.ts` and the
   mock branches in `client.ts`.

Async operations (graph build, document analysis) already use the
`pollUntilDone` helper from CLAUDE.md §15.1, polling `GET /api/jobs/{id}`.
