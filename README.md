# Scaffold — Legal Argument Graph Tool

A web-based legal argument graph tool for constructing structured litigation argument maps from EU data law regulations, case documents, and CJEU precedent. Designed for lawyers litigating under EU frameworks (GDPR, ePrivacy, etc.).

## Vision

Lawyers spend weeks manually constructing argument graphs from litigation bundles. **Scaffold** automates the first 80%:

1. **Upload regulation articles** — select EU directives (GDPR, ePrivacy, AI Act) and fetch full text via EUR-Lex
2. **Build argument structure** — Claude AI proposes a 3-5 element hierarchy of legal requirements, each with 2-4 falsifiable propositions
3. **Upload case documents** — PDFs, Word docs, emails, CSVs
4. **Classify & map evidence** — Claude automatically extracts document excerpts, classifies them as Supportive/Adverse/Neutral, and links them to propositions
5. **Identify gaps** — The system flags propositions with no supporting evidence and suggests remedial actions
6. **View real-time readiness** — A percentage score (0-100%) showing how "proven" your argument is
7. **Iterate manually** — Lawyers refine statuses, add/remove evidence, resolve gaps

## Current Status ✅

**Development completed for MVP hackathon build.** All major features are implemented and integrated:

- ✅ FastAPI backend with PostgreSQL
- ✅ EUR-Lex CELLAR integration + Claude 3.5 Haiku LLM pipeline
- ✅ Document upload & multi-format extraction (PDF, DOCX, EML, CSV)
- ✅ Full CRUD API for cases, arguments, evidence, and gaps
- ✅ React 19 frontend with Tailwind CSS v4
- ✅ Real-time readiness scoring
- ✅ JWT authentication + seeded demo user

**Scope (intentionally narrow for 8-hour hackathon):**
- Single user, local hosting only
- GDPR articles only (extensible to ePrivacy, AI Act)
- No export, versioning, or document drafting
- Demo quality (no email/2FA/SAML)

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 18+
- PostgreSQL 16+
- Anthropic API key (free trial available)

### Setup

```bash
# 1. Create database
createdb scaffold
psql scaffold < schema.sql

# 2. Backend setup
cd backend
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY

# 4. Seed demo user
python seed.py
# Creates: admin / scaffold2026

# 5. Start backend
uvicorn app.main:app --reload --port 8000
```

```bash
# In another terminal, from the repo root:

# 6. Frontend setup
cd frontend
npm install

# 7. Start dev server
npm run dev
# Opens http://localhost:5173
```

### First Login

- **Username:** `admin`
- **Password:** `scaffold2026`

## Tech Stack

| Layer | Technology | Version | Why |
|-------|-----------|---------|-----|
| **Frontend** | React | 19.2 | Modern hooks, component composition |
| | Vite | 8.1 | Fast dev server, optimized builds |
| | Tailwind CSS | 4.3 | Utility-first design, custom tokens |
| | React Router | 7.18 | Client-side navigation |
| | Lucide React | 1.21 | Lightweight icon library |
| **Backend** | FastAPI | 0.115 | Async-ready, automatic API docs |
| | SQLAlchemy | 2.0 (sync) | ORM with strong typing |
| | PostgreSQL | 16 | ACID guarantees for legal data |
| **LLM** | Claude 3.5 Haiku | latest | Fast, accurate, low cost |
| **Integrations** | EUR-Lex CELLAR | public APIs | Free regulation + case law access |
| **Document Handling** | PyMuPDF | 1.24 | Fast PDF text extraction |
| | python-docx | 1.1 | DOCX parsing |
| **Auth** | JWT + bcrypt | PyJWT 2.9 | Stateless, secure |

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│ React Frontend (localhost:5173)                             │
│ - Login, Cases, CaseSetup, CaseWorkspace (tabs)           │
│ - Polls GET /jobs/{id} every 2s for async operations      │
└─────────────────────────────┬────────────────────────────┘
                              │ JSON over HTTP
┌─────────────────────────────▼────────────────────────────┐
│ FastAPI Backend (localhost:8000)                           │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ Routers:                                            │   │
│ │ - auth.py      → /auth/login                        │   │
│ │ - cases.py     → /cases CRUD                        │   │
│ │ - articles.py  → fetch EU regulation articles       │   │
│ │ - documents.py → upload & extract documents         │   │
│ │ - graph.py     → elements & propositions CRUD       │   │
│ │ - evidence.py  → evidence items CRUD                │   │
│ │ - gaps.py      → gaps CRUD                          │   │
│ │ - jobs.py      → poll async job status              │   │
│ └─────────────────────────────────────────────────────┘   │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ Services:                                           │   │
│ │ - cellar.py        → fetch articles from EUR-Lex    │   │
│ │ - claude.py        → LLM calls for graph building   │   │
│ │ - extractors.py    → extract text from files        │   │
│ │ - graph_builder.py → orchestrate graph construction │   │
│ │ - doc_analyser.py  → map docs to propositions       │   │
│ │ - readiness.py     → score calculations             │   │
│ └─────────────────────────────────────────────────────┘   │
└─────────────────────────────┬────────────────────────────┘
                              │
┌─────────────────────────────▼────────────────────────────┐
│ PostgreSQL 16 (localhost:5432)                            │
│ - Users, Cases, Articles, Documents                       │
│ - Elements, Propositions, Evidence, Gaps                  │
│ - Jobs (async polling)                                    │
│ - File storage: ./uploads/                                │
└────────────────────────────────────────────────────────┘
                              │
                    External APIs (free)
              ┌───────────────┴──────────────┐
              │ EUR-Lex / CELLAR             │
              │ Anthropic Claude API         │
              └──────────────────────────────┘
```

## Project Structure

```
codebase/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app, CORS, route registration
│   │   ├── config.py               # Pydantic Settings (.env parsing)
│   │   ├── database.py             # SQLAlchemy engine + SessionLocal
│   │   ├── models.py               # ORM models (mirror schema.sql)
│   │   ├── schemas.py              # All Pydantic request/response schemas
│   │   ├── auth.py                 # JWT encoding/decoding, password hashing
│   │   ├── deps.py                 # get_db(), get_current_user() helpers
│   │   ├── routers/                # API endpoint modules
│   │   │   ├── auth.py             # POST /login
│   │   │   ├── cases.py            # Cases CRUD
│   │   │   ├── articles.py         # Fetch & build graph from articles
│   │   │   ├── documents.py        # Upload documents, extract text
│   │   │   ├── graph.py            # Elements & propositions CRUD
│   │   │   ├── evidence.py         # Evidence items CRUD
│   │   │   ├── gaps.py             # Gaps CRUD
│   │   │   └── jobs.py             # Async job polling
│   │   └── services/               # Business logic
│   │       ├── cellar.py           # EUR-Lex article fetching
│   │       ├── claude.py           # LLM prompts & Claude calls
│   │       ├── extractors.py       # PDF, DOCX, EML, CSV text extraction
│   │       ├── graph_builder.py    # Orchestrate article→Claude→DB flow
│   │       ├── doc_analyser.py     # Orchestrate doc→Claude→evidence flow
│   │       └── readiness.py        # Readiness % calculation
│   ├── schema.sql                  # Database schema (9 tables)
│   ├── seed.py                     # Creates demo user (admin/scaffold2026)
│   ├── requirements.txt            # Python dependencies
│   ├── .env.example                # Environment variables template
│   ├── uploads/                    # PDF/document storage (git-ignored)
│   └── migrations/                 # SQL migration files
│
├── frontend/
│   ├── src/
│   │   ├── main.tsx                # React root
│   │   ├── App.tsx                 # Router setup, auth gate
│   │   ├── api/
│   │   │   └── client.ts           # HTTP client (all endpoints)
│   │   ├── components/
│   │   │   ├── Layout.tsx          # Top-level app shell
│   │   │   └── ui.tsx              # Reusable UI components
│   │   ├── pages/
│   │   │   ├── Login.tsx           # Login page
│   │   │   ├── CasesList.tsx       # Case list + create
│   │   │   ├── CaseSetup.tsx       # Add articles + upload docs
│   │   │   └── CaseWorkspace.tsx   # Main workspace (4 tabs)
│   │   ├── features/               # Workspace tab components
│   │   │   ├── CaseOverview.tsx    # Case stats & readiness
│   │   │   ├── ArgumentGraph.tsx   # Graph visualization & editing
│   │   │   ├── DocumentsInbox.tsx  # Document list + upload
│   │   │   └── GapsPanel.tsx       # Gaps list + manual gap creation
│   │   ├── types/
│   │   │   └── index.ts            # TypeScript contracts (match backend schemas)
│   │   └── index.css               # Tailwind + design tokens
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── dist/                       # Built frontend (git-ignored)
│
├── CLAUDE.md                       # Full technical specification
├── DESIGN_SYSTEM.md               # Visual design tokens
└── README.md                       # This file
```

## Database Schema

**9 tables covering the full argument graph lifecycle:**

| Table | Purpose |
|-------|---------|
| `users` | Demo user (single tenant) |
| `cases` | Litigation cases with metadata + readiness score |
| `case_articles` | Fetched regulation articles linked to cases |
| `documents` | Uploaded PDFs, Word docs, emails, CSVs |
| `elements` | Top-level legal requirements (E1, E2, ...) |
| `propositions` | Sub-claims within elements (E1-P1, E1-P2, ...) |
| `evidence` | Extracted document excerpts linked to propositions |
| `gaps` | Unproven propositions + remedial actions |
| `jobs` | Async job tracking (polling for status) |

See `schema.sql` for full DDL with indexes and constraints.

## API Overview

All endpoints are prefixed `/api` and require `Authorization: Bearer <token>` header (except `/auth/login`).

### Authentication
```
POST /auth/login
Body: { username, password }
Response: { access_token, token_type: "bearer" }
```

### Cases
```
GET    /cases                      # List all cases
POST   /cases                      # Create new case
GET    /cases/{id}                 # Case detail with argument graph
PUT    /cases/{id}                 # Update case metadata
DELETE /cases/{id}                 # Delete case + children
```

### Argument Graph
```
GET    /cases/{id}/graph           # Full graph (elements → propositions)
POST   /cases/{id}/elements        # Create element
PUT    /elements/{id}              # Update element
DELETE /elements/{id}              # Delete element + children
POST   /elements/{id}/propositions # Create proposition
PUT    /propositions/{id}          # Update proposition
DELETE /propositions/{id}          # Delete proposition + evidence
```

### Regulation Articles
```
POST   /cases/{id}/articles        # Trigger graph build from articles
Response: { job_id }
GET    /cases/{id}/articles        # List articles for case
```

### Documents
```
POST   /cases/{id}/documents       # Upload & analyze document
Response: { document_id, job_id }
GET    /cases/{id}/documents       # List documents
GET    /documents/{id}             # Document detail + evidence items
DELETE /documents/{id}             # Delete document + file
```

### Evidence & Gaps
```
GET    /propositions/{id}/evidence
POST   /propositions/{id}/evidence # Add evidence manually
PUT    /evidence/{id}              # Update evidence
DELETE /evidence/{id}              # Delete evidence

GET    /cases/{id}/gaps            # List gaps (sorted by severity)
POST   /cases/{id}/gaps            # Create gap manually
PUT    /gaps/{id}                  # Update gap status
DELETE /gaps/{id}                  # Delete gap
```

### Async Polling
```
GET    /jobs/{job_id}
Response: { id, status, job_type, error, completed_at }
```

Full specification: see `CLAUDE.md` (§7).

## Readiness Calculation

The **readiness score** (0-100%) reflects how "proven" your case is:

```
readiness = (established + 0.5 × contested) / total_propositions × 100

Where:
- Established = proposition has supportive evidence, no adverse evidence
- Contested   = proposition has both supportive AND adverse evidence
- Gap         = proposition has no evidence
```

Score is recalculated whenever you:
- Add/delete evidence
- Change proposition status manually
- Upload a new document

## Workflow Example

### Step 1: Create case
```bash
curl -X POST http://localhost:8000/api/cases \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Data Subject v TechCorp",
    "client": "John Doe",
    "court": "High Court (London)"
  }'
```

### Step 2: Add GDPR articles
```bash
curl -X POST http://localhost:8000/api/cases/$CASE_ID/articles \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "articles": [
      {
        "regulation_id": "gdpr",
        "celex_id": "32016R0679",
        "article_number": "82"
      }
    ]
  }'
# Returns: { job_id: "..." }

# Poll until done
curl http://localhost:8000/api/jobs/$JOB_ID \
  -H "Authorization: Bearer $TOKEN"
# Response: { status: "done", ... }
```

Backend now fetches Article 82 from EUR-Lex, sends to Claude, and creates elements + propositions.

### Step 3: Upload evidence documents
```bash
curl -X POST http://localhost:8000/api/cases/$CASE_ID/documents \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@my-evidence.pdf"
# Returns: { document_id: "...", job_id: "..." }

# Poll until analysis complete
curl http://localhost:8000/api/jobs/$JOB_ID \
  -H "Authorization: Bearer $TOKEN"
```

Claude extracts text, maps it to propositions, classifies evidence, and suggests gaps.

### Step 4: View case in UI
Navigate to http://localhost:5173/cases/$CASE_ID to visualize the argument graph, readiness score, and identified gaps.

## Supported Document Formats

| Format | Method | Notes |
|--------|--------|-------|
| PDF | PyMuPDF | Recommended for scans; no OCR support |
| DOCX | python-docx | Full text extraction |
| EML | Built-in parser | Email headers + body |
| CSV | pandas → text | Flattened as key-value pairs |
| TXT | Direct read | Plain text files |

Scanned PDFs without selectable text will fail gracefully with a clear error message.

## Development

### Running Tests

Currently no automated test suite (demo/hackathon scope). For integration testing:

1. Start backend: `uvicorn app.main:app --reload --port 8000`
2. Start frontend: `npm run dev`
3. Walk through the UI end-to-end in the browser

### Linting & Type Checking

**Frontend:**
```bash
npm run lint          # ESLint
tsc -b               # TypeScript
npm run build        # Full check + Vite build
```

**Backend:**
No linting configured yet (consider adding `ruff`, `mypy` in future iterations).

### Adding a New Document Format

1. Add extractor function to `backend/app/services/extractors.py`
2. Call it from `backend/app/routers/documents.py` → POST endpoint
3. Ensure output is plain text for Claude to analyze

Example (see `extractors.py`):
```python
def extract_eml(file_path: str) -> str:
    """Extract text from .eml email files."""
    # Read MIME, extract headers + body
    # Return concatenated text
```

### Customizing Claude Prompts

LLM prompts are in `backend/app/services/claude.py`:
- `GRAPH_BUILD_PROMPT` — constructs argument structure from articles
- `DOC_ANALYSIS_PROMPT` — maps documents to propositions

Adjust these to change how Claude behaves (e.g., more/fewer elements, different evidence classification scheme).

### Extending to New Regulations

1. Add regulation metadata to `frontend/src/pages/CaseSetup.tsx` (UI only)
2. Backend already handles any GDPR, ePrivacy, AI Act CELEX IDs
3. EUR-Lex article HTML parsing may need tweaks per regulation (fallback logic in `cellar.py`)

## Environment Variables

Create a `.env` file in `backend/`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/scaffold
ANTHROPIC_API_KEY=sk-ant-...                                       # Required
JWT_SECRET=your-random-32-character-secret-key-here
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480
UPLOADS_DIR=./uploads
FRONTEND_ORIGIN=http://localhost:5173
```

See `.env.example` for defaults.

## Performance Notes

- **Document analysis:** ~5-10 seconds per document (Claude API latency)
- **Graph building:** ~3-5 seconds per 2-3 articles
- **Frontend polling:** Every 2 seconds while job is in-flight
- **Database:** Queries are indexed on `case_id`, `element_id`, `proposition_id` for fast lookups

For production: consider implementing a message queue (Celery + Redis) instead of FastAPI `BackgroundTasks`.

## Known Limitations

1. **Single user only** — no multi-tenancy, no login per firm/team
2. **No export** — argument graphs stay in the app; no PDF/Word output
3. **No versioning** — changes are live; no undo/branch history
4. **GDPR-only** — regulated for GDPR MVP; ePrivacy & AI Act templates exist but untested
5. **Scanned PDFs fail** — no OCR support; requires copy-paste-able text
6. **No document drafting** — argument graph is a separate tool, doesn't generate pleadings

## Deployment

**For demo/hackathon:** local hosting only.

**For production (future):**
1. Migrate to async SQLAlchemy + Celery for document pipelines
2. Add multi-tenancy with firm-level RBAC
3. Deploy frontend to Vercel/Netlify, backend to Railway/Render
4. Use AWS S3 for document storage
5. Add email notifications for job completion
6. Implement Stripe billing (per-case or per-document tier)

See `CLAUDE.md` (§20) for a full post-hackathon roadmap.

## Contributing

This is a **hackathon prototype**, not a production codebase. For future contributions:

1. Read `CLAUDE.md` (full spec) + `DESIGN_SYSTEM.md` (visual tokens)
2. Follow the tech stack choices (FastAPI, SQLAlchemy, React, Tailwind)
3. Keep endpoints aligned with the schema in `CLAUDE.md` (§7)
4. Test end-to-end: backend + frontend together
