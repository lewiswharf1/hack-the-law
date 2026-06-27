# Scaffold — Full Technical Specification

## 0. Response Style

When working on this project:

- **No assumptions**: If requests are unclear, ask exhaustive clarifying questions before proceeding. Don't guess intent.
- **Challenge weak ideas**: If plans or requirements seem underdeveloped, push back and ask for more detail or justification.
- **Stay in scope**: Only do what's explicitly asked. Don't anticipate future needs, add "nice-to-haves," or refactor beyond the task. Ship exactly what was requested.

---

## 1. Context & Goals

**What this is:** A legal argument graph tool for EU data law litigation. A lawyer uploads a litigation bundle, selects EU regulation articles, and Scaffold uses Claude to construct a structured argument graph (Elements → Propositions → Evidence). Documents are classified and mapped to propositions automatically.

**Constraints:**
- 8-hour hackathon build
- Single user, local hosting, demo only
- GDPR articles only for MVP
- No export, no versioning, no document drafting editor, no multi-user

**Existing asset:** A React/Vite/Tailwind mockup at `mockup_eu copy/` — all visual design is done. The backend replaces the static `data.ts` imports with real API calls.

---

## 2. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React 18 + Vite + Tailwind | Existing mockup, adapt data layer only |
| Backend | Python 3.12 + FastAPI 0.115 | Sync (no async SQLAlchemy for speed) |
| Database | PostgreSQL 16 | Single local instance |
| ORM | SQLAlchemy 2.0 (sync) | psycopg2-binary driver |
| LLM | Claude 3.5 Haiku | anthropic SDK |
| PDF | PyMuPDF (fitz) | Text extraction only, no OCR |
| HTTP client | httpx | Sync, for CELLAR API |
| HTML parser | beautifulsoup4 + lxml | Parse EUR-Lex article HTML |
| Auth | PyJWT + passlib[bcrypt] | Single pre-seeded user, no registration |
| File storage | Local filesystem (`./uploads/`) | |
| Background jobs | FastAPI BackgroundTasks | No Celery, polling for status |
| Frontend HTTP | fetch + polling | No Tanstack Query needed for demo |

**`requirements.txt`:**
```
fastapi==0.115.0
uvicorn[standard]==0.30.0
sqlalchemy==2.0.35
psycopg2-binary==2.9.9
pyjwt==2.9.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.9
httpx==0.27.2
anthropic==0.39.0
pymupdf==1.24.11
beautifulsoup4==4.12.3
lxml==5.3.0
python-dotenv==1.0.1
pydantic==2.9.0
pydantic-settings==2.5.2
```

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  React Frontend  (localhost:5173)                             │
│  - Polls GET /api/jobs/{id} every 2s for async operations    │
│  - All state from API (replaces data.ts)                     │
└─────────────────────────┬────────────────────────────────────┘
                          │ JSON over HTTP
┌─────────────────────────▼────────────────────────────────────┐
│  FastAPI  (localhost:8000)                                    │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │  Auth       │  │  Cases CRUD  │  │  Graph CRUD        │  │
│  │  /auth/login│  │  /cases      │  │  /elements         │  │
│  └─────────────┘  └──────────────┘  │  /propositions     │  │
│  ┌─────────────────────────────┐    └────────────────────┘  │
│  │  CELLAR Service             │  ┌────────────────────────┐ │
│  │  → EUR-Lex HTML + parse     │  │  Document Service      │ │
│  │  → Claude graph build       │  │  → PyMuPDF extract     │ │
│  │  → saves elements/props     │  │  → Claude classify     │ │
│  └─────────────────────────────┘  │  → saves evidence/gaps │ │
│  ┌───────────────┐                └────────────────────────┘ │
│  │  Jobs table   │ ← BackgroundTasks write status here       │
│  └───────────────┘                                           │
└─────────────────────────┬────────────────────────────────────┘
                          │
┌─────────────────────────▼────────────────────────────────────┐
│  PostgreSQL (localhost:5432, db: scaffold)                    │
│  ./uploads/  (local PDF storage)                             │
└──────────────────────────────────────────────────────────────┘
                          │
                     External APIs
              ┌───────────┴────────────┐
              │ EUR-Lex / CELLAR API   │
              │ Anthropic Claude API   │
              └────────────────────────┘
```

---

## 4. Database Schema

Run this as `schema.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Auth
CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username     TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Cases
CREATE TABLE cases (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  short_name   TEXT NOT NULL,
  client       TEXT NOT NULL DEFAULT '',
  court        TEXT NOT NULL DEFAULT '',
  reference    TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'Draft',
  claim_type   TEXT NOT NULL DEFAULT 'Pending',
  lead         TEXT NOT NULL DEFAULT 'LW',
  readiness    INTEGER NOT NULL DEFAULT 0,
  has_graph    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Articles fetched from CELLAR and linked to a case
CREATE TABLE case_articles (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id         UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  regulation_id   TEXT NOT NULL,          -- e.g. 'gdpr'
  celex_id        TEXT NOT NULL,          -- e.g. '32016R0679'
  article_number  TEXT NOT NULL,          -- e.g. '82'
  article_title   TEXT NOT NULL DEFAULT '',
  article_text    TEXT NOT NULL DEFAULT '',
  fetched_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Argument graph: Elements
CREATE TABLE elements (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id    UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,              -- 'E1', 'E2', ...
  title      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'Gap', -- Established | Contested | Gap
  source     TEXT NOT NULL DEFAULT '',    -- 'Art. 82 GDPR'
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Argument graph: Propositions
CREATE TABLE propositions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  element_id UUID NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
  case_id    UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,              -- 'E1-P1', 'E1-P2', ...
  title      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'Gap', -- Established | Contested | Gap
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Uploaded documents
CREATE TABLE documents (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id           UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  filename          TEXT NOT NULL,
  file_path         TEXT NOT NULL,
  file_size_bytes   INTEGER NOT NULL DEFAULT 0,
  doc_type          TEXT,                 -- set by LLM: Expert Report | Judgment | etc.
  extracted_text    TEXT,
  processing_status TEXT NOT NULL DEFAULT 'pending', -- pending | processing | done | failed
  uploaded_at       TIMESTAMPTZ DEFAULT NOW(),
  processed_at      TIMESTAMPTZ
);

-- Evidence items linking document excerpts to propositions
CREATE TABLE evidence (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id      UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  proposition_id   UUID NOT NULL REFERENCES propositions(id) ON DELETE CASCADE,
  excerpt          TEXT NOT NULL,
  classification   TEXT NOT NULL,  -- Supportive | Adverse | Neutral
  source_ref       TEXT NOT NULL DEFAULT '',
  added_by         TEXT NOT NULL DEFAULT 'ai',  -- 'ai' | 'human'
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Gaps
CREATE TABLE gaps (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id        UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  proposition_id UUID REFERENCES propositions(id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  why            TEXT NOT NULL DEFAULT '',
  severity       TEXT NOT NULL DEFAULT 'High',   -- Critical | High | Medium
  action         TEXT NOT NULL DEFAULT '',
  source         TEXT NOT NULL DEFAULT 'ai',     -- 'ai' | 'human'
  status         TEXT NOT NULL DEFAULT 'open',   -- open | resolved
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Async job tracking (for polling)
CREATE TABLE jobs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id      UUID REFERENCES cases(id) ON DELETE CASCADE,
  document_id  UUID REFERENCES documents(id) ON DELETE CASCADE,
  job_type     TEXT NOT NULL,   -- 'build_graph' | 'analyse_document'
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending | running | done | failed
  result       JSONB,
  error        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_elements_case    ON elements(case_id);
CREATE INDEX idx_propositions_case ON propositions(case_id);
CREATE INDEX idx_propositions_elem ON propositions(element_id);
CREATE INDEX idx_evidence_prop     ON evidence(proposition_id);
CREATE INDEX idx_gaps_case         ON gaps(case_id);
CREATE INDEX idx_jobs_case         ON jobs(case_id);
CREATE INDEX idx_documents_case    ON documents(case_id);
```

---

## 5. Project File Structure

```
scaffold-backend/
├── app/
│   ├── main.py              # FastAPI app, CORS, routers
│   ├── config.py            # Pydantic Settings from .env
│   ├── database.py          # SQLAlchemy engine, SessionLocal, Base
│   ├── models.py            # SQLAlchemy ORM models (mirror schema.sql)
│   ├── schemas.py           # All Pydantic request/response schemas
│   ├── auth.py              # JWT encode/decode, password hashing
│   ├── deps.py              # get_db(), get_current_user() dependencies
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── auth.py          # POST /auth/login
│   │   ├── cases.py         # GET/POST/PUT/DELETE /cases
│   │   ├── articles.py      # POST /cases/{id}/articles  (trigger build)
│   │   ├── documents.py     # POST/GET /cases/{id}/documents
│   │   ├── graph.py         # CRUD for elements + propositions
│   │   ├── evidence.py      # CRUD for evidence items
│   │   ├── gaps.py          # CRUD for gaps
│   │   └── jobs.py          # GET /jobs/{id}
│   └── services/
│       ├── __init__.py
│       ├── cellar.py        # EUR-Lex HTML fetch + article parser
│       ├── claude.py        # Claude client + prompts
│       ├── pdf.py           # PyMuPDF text extraction
│       ├── graph_builder.py # Orchestrates CELLAR + Claude → saves graph
│       └── doc_analyser.py  # Orchestrates PDF + Gemini → saves evidence/gaps
├── uploads/                  # PDF storage (git-ignored)
├── schema.sql
├── seed.py                   # Creates default user (run once)
├── requirements.txt
├── .env
└── .env.example
```

---

## 6. Environment Variables (`.env`)

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/scaffold
ANTHROPIC_API_KEY=your_anthropic_api_key
JWT_SECRET=change_me_to_a_random_32char_string
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480
UPLOADS_DIR=./uploads
FRONTEND_ORIGIN=http://localhost:5173
```

---

## 7. Full API Specification

All routes are prefixed `/api`. All protected routes require `Authorization: Bearer <token>` header.

### Auth

```
POST /api/auth/login
Body: { "username": string, "password": string }
Response: { "access_token": string, "token_type": "bearer" }
```

### Cases

```
GET    /api/cases
Response: CaseSummary[]

POST   /api/cases
Body: { name, client, court, reference }
Response: CaseSummary

GET    /api/cases/{case_id}
Response: CaseDetail (includes elements with propositions)

PUT    /api/cases/{case_id}
Body: Partial<{ name, client, court, reference, status }>
Response: CaseSummary

DELETE /api/cases/{case_id}
Response: { "ok": true }
```

### Articles & Graph Build

```
POST   /api/cases/{case_id}/articles
Body: {
  "articles": [
    { "regulation_id": "gdpr", "celex_id": "32016R0679", "article_number": "82" },
    { "regulation_id": "gdpr", "celex_id": "32016R0679", "article_number": "32" }
  ]
}
Response: { "job_id": string }
-- Immediately returns a job_id. Backend runs in BackgroundTasks:
--   1. Fetch article text from EUR-Lex/CELLAR
--   2. Call Claude to build graph
--   3. Save elements + propositions to DB
--   4. Set case.has_graph = true, case.status = 'In Progress'
--   5. Set job.status = 'done'

GET    /api/cases/{case_id}/articles
Response: CaseArticle[]
```

### Argument Graph (Elements + Propositions)

```
GET    /api/cases/{case_id}/graph
Response: {
  elements: [{
    id, label, title, status, source, position,
    propositions: [{ id, label, title, status, position, evidence_count, gap_count }]
  }]
}

-- Elements
POST   /api/cases/{case_id}/elements
Body: { label, title, source }
Response: Element

PUT    /api/elements/{element_id}
Body: Partial<{ title, status, source }>
Response: Element

DELETE /api/elements/{element_id}
Response: { "ok": true }

-- Propositions
POST   /api/elements/{element_id}/propositions
Body: { label, title }
Response: Proposition

PUT    /api/propositions/{proposition_id}
Body: Partial<{ title, status }>
Response: Proposition

DELETE /api/propositions/{proposition_id}
Response: { "ok": true }
```

### Documents

```
POST   /api/cases/{case_id}/documents
Content-Type: multipart/form-data
Body: file (PDF)
Response: { "document_id": string, "job_id": string }
-- Saves file, extracts text immediately (sync, fast), then runs LLM analysis in BackgroundTasks:
--   1. Build prompt with document text + all case propositions
--   2. Call Claude → classification, evidence mappings, suggested gaps
--   3. Save evidence items to DB
--   4. Save AI-suggested gaps to DB (source='ai')
--   5. Recalculate + save case readiness
--   6. Set document.processing_status = 'done'
--   7. Set job.status = 'done'

GET    /api/cases/{case_id}/documents
Response: Document[]

GET    /api/documents/{document_id}
Response: DocumentDetail (includes evidence items)

DELETE /api/documents/{document_id}
Response: { "ok": true }
```

### Evidence

```
GET    /api/propositions/{proposition_id}/evidence
Response: Evidence[]

POST   /api/propositions/{proposition_id}/evidence
Body: { document_id, excerpt, classification, source_ref }
-- added_by set to 'human'
Response: Evidence

PUT    /api/evidence/{evidence_id}
Body: Partial<{ excerpt, classification, source_ref }>
Response: Evidence

DELETE /api/evidence/{evidence_id}
Response: { "ok": true }
```

### Gaps

```
GET    /api/cases/{case_id}/gaps
Response: Gap[]

POST   /api/cases/{case_id}/gaps
Body: { title, why, severity, action, proposition_id? }
-- added_by set to 'human'
Response: Gap

PUT    /api/gaps/{gap_id}
Body: Partial<{ title, why, severity, action, status }>
-- Used for human override (change severity) or resolve
Response: Gap

DELETE /api/gaps/{gap_id}
Response: { "ok": true }
```

### Jobs (Polling)

```
GET    /api/jobs/{job_id}
Response: {
  id: string,
  status: "pending" | "running" | "done" | "failed",
  job_type: string,
  error: string | null,
  completed_at: string | null
}
```

---

## 8. Readiness Score Calculation

Calculated after every evidence change or gap change. Saved to `cases.readiness`.

```python
def calculate_readiness(db: Session, case_id: str) -> int:
    propositions = db.query(Proposition).filter_by(case_id=case_id).all()
    if not propositions:
        return 0
    total = len(propositions)
    score = sum(
        1.0 if p.status == "Established" else
        0.5 if p.status == "Contested" else
        0.0
        for p in propositions
    )
    return round((score / total) * 100)
```

Call this and write back to `cases.readiness` after:
- Any evidence item is added/deleted/changed
- Any proposition status is changed
- Document analysis completes

---

## 9. Proposition Status Auto-Update

After evidence is added, auto-update the parent proposition status:

```python
def refresh_proposition_status(db: Session, proposition_id: str):
    evidence = db.query(Evidence).filter_by(proposition_id=proposition_id).all()
    if not evidence:
        status = "Gap"
    else:
        supportive = sum(1 for e in evidence if e.classification == "Supportive")
        adverse    = sum(1 for e in evidence if e.classification == "Adverse")
        if supportive > 0 and adverse == 0:
            status = "Established"
        else:
            status = "Contested"
    db.query(Proposition).filter_by(id=proposition_id).update({"status": status})
    db.commit()
```

Then refresh element status (worst-case child propagates up: if any child is Gap → Gap; if any Contested → Contested; else Established).

---

## 10. CELLAR Service (`services/cellar.py`)

The service fetches regulation articles from EUR-Lex HTML (public endpoint) and related CJEU case law from the CELLAR SPARQL endpoint (public, no credentials required). Both are passed to Gemini for context when building the argument graph.

```python
import httpx
import json
from bs4 import BeautifulSoup
from app.config import settings

EURLEX_HTML_URL = "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:{celex_id}"
CELLAR_SPARQL_URL = "https://publications.europa.eu/webapi/rdf/sparql"

def fetch_article_text(celex_id: str, article_number: str) -> dict:
    """
    Fetch full text of a specific article from EUR-Lex HTML (public endpoint).
    Returns {"title": str, "text": str}
    """
    url = EURLEX_HTML_URL.format(celex_id=celex_id)
    resp = httpx.get(url, timeout=30, follow_redirects=True)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "lxml")
    return _extract_article(soup, article_number)


def fetch_related_case_law(celex_id: str, article_number: str) -> list[dict]:
    """
    Query CELLAR SPARQL endpoint for the top 10 most recent CJEU cases mentioning
    the given regulation and article. Returns [{"title": str, "celex_id": str, "url": str}]
    """
    # SPARQL query: find case law (CJEU judgments) referencing this regulation and article
    query = f"""
    PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    
    SELECT DISTINCT ?caseUri ?caseTitle ?date
    WHERE {{
      ?caseUri a cdm:case_law ;
               skos:prefLabel ?caseTitle ;
               cdm:date_publication ?date ;
               cdm:refers_to_eli_document ?eli .
      ?eli cdm:eli_document_identifier ?eliId .
      FILTER(CONTAINS(?eliId, "{celex_id}") || CONTAINS(?caseTitle, "Art. {article_number}"))
    }}
    ORDER BY DESC(?date)
    LIMIT 10
    """
    
    resp = httpx.get(
        CELLAR_SPARQL_URL,
        params={
            "query": query,
            "format": "json"
        },
        timeout=30
    )
    resp.raise_for_status()
    
    results = resp.json().get("results", {}).get("bindings", [])
    return [
        {
            "title": r.get("caseTitle", {}).get("value", ""),
            "celex_id": r.get("caseUri", {}).get("value", "").split("/")[-1],
            "url": r.get("caseUri", {}).get("value", "")
        }
        for r in results
        if r.get("caseTitle", {}).get("value")
    ]


def _extract_article(soup: BeautifulSoup, article_number: str) -> dict:
    """
    Parse the EUR-Lex HTML to extract a specific article by number.
    EUR-Lex HTML uses <p class="ti-art"> for article headings.
    """
    target = f"Article {article_number}"

    # Find all article heading elements
    headings = soup.find_all("p", class_="ti-art")

    for i, heading in enumerate(headings):
        if target.lower() in heading.get_text().lower():
            # Collect text until the next article heading
            title_el = heading.find_next_sibling()
            title = title_el.get_text(strip=True) if title_el else ""

            # Gather body text until next article heading
            body_parts = []
            for sibling in heading.find_next_siblings():
                if sibling.name == "p" and "ti-art" in sibling.get("class", []):
                    break
                body_parts.append(sibling.get_text(separator=" ", strip=True))

            return {
                "title": title,
                "text": f"{target}\n{title}\n\n" + "\n\n".join(body_parts)
            }

    raise ValueError(f"Article {article_number} not found in CELEX:{celex_id}")
```

> **Note:** EUR-Lex HTML structure varies slightly between regulations. If `class="ti-art"` doesn't match, also try `class_="sti-art"`, plain `<h3>`, or search for the text pattern `"Article {N}"` in `<p>` tags directly. Add a fallback text search if the class-based approach fails.

---

## 11. Claude Service (`services/claude.py`)

```python
import json
import re
from anthropic import Anthropic
from app.config import settings

client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)

GRAPH_BUILD_PROMPT = """You are a legal AI assistant specialising in EU regulation litigation.

The following EU regulation article(s) have been selected as the basis for a legal claim:

{articles}

Related case law from CJEU (for context and precedent):
{case_law}

Case context:
- Case name: {case_name}
- Client: {client}

Your task: Propose a structured argument graph for this claim. Each "element" is a top-level legal requirement that must be proven. Each "proposition" is a specific, falsifiable sub-claim within that element. Consider the related case law as precedent and context.

Return ONLY valid JSON in this exact structure (no markdown, no explanation):
{{
  "elements": [
    {{
      "label": "E1",
      "title": "Short descriptive title of this legal element",
      "source": "Art. XX GDPR",
      "propositions": [
        {{
          "label": "E1-P1",
          "title": "Specific legal proposition that must be established"
        }}
      ]
    }}
  ]
}}

Guidelines:
- Derive elements directly from the legal structure of the articles
- 3–5 elements is typical
- 2–4 propositions per element
- Each proposition must be a concrete, evidence-testable statement
- Labels must be sequential: E1, E2, E3 and E1-P1, E1-P2, etc.
- For Art. 82 GDPR claims, the three core elements are: (1) GDPR infringement by controller, (2) damage suffered by data subject, (3) causal link between infringement and damage
- Use related case law to inform the propositions and identify sub-elements courts have found relevant
"""

DOC_ANALYSIS_PROMPT = """You are a legal AI assistant. Analyse the following document in the context of an EU law claim.

DOCUMENT TEXT:
{doc_text}

LEGAL PROPOSITIONS TO MAP AGAINST:
{propositions_json}

Your tasks:
1. Classify the document type
2. Identify excerpts that are evidence for specific propositions
3. Classify each excerpt as Supportive, Adverse, or Neutral to its proposition
4. Identify which propositions have NO supporting evidence (gaps)
5. For each gap, suggest a specific remedial action

Return ONLY valid JSON (no markdown, no explanation):
{{
  "doc_type": "Expert Report | Judgment | Witness Statement | Correspondence | Regulation",
  "evidence_mappings": [
    {{
      "proposition_id": "uuid-of-proposition",
      "excerpt": "Exact or near-exact text from the document",
      "classification": "Supportive | Adverse | Neutral",
      "source_ref": "e.g. §4.2, p.12, para 17"
    }}
  ],
  "suggested_gaps": [
    {{
      "proposition_id": "uuid-of-proposition",
      "title": "Short gap title",
      "why": "Why this is a gap in the current evidence",
      "severity": "Critical | High | Medium",
      "action": "Specific recommended action to address this gap"
    }}
  ]
}}

Important:
- Only include evidence_mappings where the document actually contains relevant content
- Only flag a gap if the proposition has no supportive evidence across all documents (not just this one)
- Use the exact proposition UUIDs provided, not labels
- Keep excerpts under 300 characters, capturing the most legally significant sentence
"""


def _parse_json(text: str) -> dict:
    """Extract JSON from Claude response, handling markdown code fences."""
    text = text.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
    return json.loads(text)


def build_argument_graph(case_name: str, client_name: str, articles: list[dict], case_law: list[dict] = None) -> dict:
    """
    articles: [{"article_number": "82", "article_title": "...", "article_text": "..."}]
    case_law: [{"title": "Case name", "celex_id": "...", "url": "..."}] (optional)
    Returns parsed JSON dict with 'elements' key.
    """
    articles_str = "\n\n---\n\n".join(
        f"Article {a['article_number']} — {a['article_title']}\n\n{a['article_text']}"
        for a in articles
    )
    
    case_law_str = "None found."
    if case_law:
        case_law_str = "\n".join(
            f"- {cl['title']} ({cl['celex_id']})"
            for cl in case_law
        )
    
    prompt = GRAPH_BUILD_PROMPT.format(
        articles=articles_str,
        case_law=case_law_str,
        case_name=case_name,
        client=client_name,
    )
    response = client.messages.create(
        model="claude-3-5-haiku-20241022",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}]
    )
    return _parse_json(response.content[0].text)


def analyse_document(doc_text: str, propositions: list[dict]) -> dict:
    """
    propositions: [{"id": uuid, "label": "E1-P1", "title": "..."}]
    Returns parsed JSON dict with 'doc_type', 'evidence_mappings', 'suggested_gaps'.
    """
    # Truncate doc text to ~50k chars to stay within token limits
    truncated = doc_text[:50_000]
    prompt = DOC_ANALYSIS_PROMPT.format(
        doc_text=truncated,
        propositions_json=json.dumps(propositions, indent=2),
    )
    response = client.messages.create(
        model="claude-3-5-haiku-20241022",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}]
    )
    return _parse_json(response.content[0].text)
```

---

## 12. PDF Service (`services/pdf.py`)

```python
import fitz  # PyMuPDF

def extract_text(file_path: str) -> str:
    """Extract all text from a PDF file."""
    doc = fitz.open(file_path)
    pages = []
    for page in doc:
        pages.append(page.get_text())
    doc.close()
    return "\n\n".join(pages)
```

---

## 13. Graph Builder Orchestrator (`services/graph_builder.py`)

```python
from sqlalchemy.orm import Session
from app import models
from app.services import cellar, claude
from app.services.readiness import calculate_readiness
import uuid

def run_graph_build(
    db: Session,
    case_id: str,
    job_id: str,
    articles_input: list[dict],  # [{regulation_id, celex_id, article_number}]
):
    """
    Full pipeline: fetch articles + case law → Claude → save to DB.
    Runs in BackgroundTasks.
    """
    try:
        # Update job to running
        db.query(models.Job).filter_by(id=job_id).update({"status": "running"})
        db.commit()

        case = db.query(models.Case).filter_by(id=case_id).first()

        # 1. Fetch article text from EUR-Lex for each article
        fetched_articles = []
        for art in articles_input:
            result = cellar.fetch_article_text(art["celex_id"], art["article_number"])

            # Save to case_articles
            ca = models.CaseArticle(
                case_id=case_id,
                regulation_id=art["regulation_id"],
                celex_id=art["celex_id"],
                article_number=art["article_number"],
                article_title=result["title"],
                article_text=result["text"],
            )
            db.add(ca)
            db.flush()

            fetched_articles.append({
                "article_number": art["article_number"],
                "article_title": result["title"],
                "article_text": result["text"],
            })

        # 2. Fetch related case law from CELLAR SPARQL (use first article for case law context)
        case_law = []
        if fetched_articles:
            first = articles_input[0]
            try:
                case_law = cellar.fetch_related_case_law(first["celex_id"], first["article_number"])
            except Exception as e:
                # If case law fetch fails, continue without it (graceful degradation)
                pass

        # 3. Call Claude to build graph with articles + case law context
        graph = claude.build_argument_graph(case.name, case.client, fetched_articles, case_law)

        # 4. Save elements + propositions to DB
        for elem_data in graph.get("elements", []):
            element = models.Element(
                id=str(uuid.uuid4()),
                case_id=case_id,
                label=elem_data["label"],
                title=elem_data["title"],
                source=elem_data.get("source", ""),
                status="Gap",
                position=int(elem_data["label"][1:]),
            )
            db.add(element)
            db.flush()

            for i, prop_data in enumerate(elem_data.get("propositions", [])):
                proposition = models.Proposition(
                    id=str(uuid.uuid4()),
                    element_id=element.id,
                    case_id=case_id,
                    label=prop_data["label"],
                    title=prop_data["title"],
                    status="Gap",
                    position=i,
                )
                db.add(proposition)

        # 5. Update case with graph built status
        db.query(models.Case).filter_by(id=case_id).update({
            "has_graph": True,
            "status": "In Progress",
            "claim_type": ", ".join(
                f"Art. {a['article_number']} GDPR" for a in articles_input
            ),
        })

        # 6. Mark job done
        db.query(models.Job).filter_by(id=job_id).update({
            "status": "done",
            "completed_at": "NOW()",
        })
        db.commit()

    except Exception as e:
        db.rollback()
        db.query(models.Job).filter_by(id=job_id).update({
            "status": "failed",
            "error": str(e),
        })
        db.commit()
        raise
```

---

## 14. Document Analyser Orchestrator (`services/doc_analyser.py`)

```python
from sqlalchemy.orm import Session
from datetime import datetime
from app import models
from app.services import claude
from app.services.readiness import calculate_readiness, refresh_proposition_status
import uuid

def run_document_analysis(
    db: Session,
    case_id: str,
    document_id: str,
    job_id: str,
):
    """
    Full pipeline: text extraction → Claude → save evidence + gaps.
    Text has already been extracted and saved; this reads it from DB.
    Runs in BackgroundTasks.
    """
    try:
        db.query(models.Job).filter_by(id=job_id).update({"status": "running"})
        db.query(models.Document).filter_by(id=document_id).update(
            {"processing_status": "processing"}
        )
        db.commit()

        document = db.query(models.Document).filter_by(id=document_id).first()

        # Get all propositions for the case to pass to Gemini
        propositions = db.query(models.Proposition).filter_by(case_id=case_id).all()
        props_for_prompt = [
            {"id": str(p.id), "label": p.label, "title": p.title}
            for p in propositions
        ]

        # Call Claude
        result = claude.analyse_document(document.extracted_text, props_for_prompt)

        # Save doc_type
        db.query(models.Document).filter_by(id=document_id).update({
            "doc_type": result.get("doc_type"),
            "processing_status": "done",
            "processed_at": datetime.utcnow(),
        })

        # Save evidence mappings
        proposition_ids_updated = set()
        for mapping in result.get("evidence_mappings", []):
            prop_id = mapping.get("proposition_id")
            if not prop_id:
                continue
            ev = models.Evidence(
                id=str(uuid.uuid4()),
                document_id=document_id,
                proposition_id=prop_id,
                excerpt=mapping.get("excerpt", ""),
                classification=mapping.get("classification", "Neutral"),
                source_ref=mapping.get("source_ref", ""),
                added_by="ai",
            )
            db.add(ev)
            proposition_ids_updated.add(prop_id)

        db.flush()

        # Refresh proposition statuses
        for prop_id in proposition_ids_updated:
            refresh_proposition_status(db, prop_id)

        # Save AI-suggested gaps (only if not already flagged)
        existing_gap_prop_ids = {
            str(g.proposition_id)
            for g in db.query(models.Gap).filter_by(case_id=case_id, source="ai").all()
        }
        for gap_data in result.get("suggested_gaps", []):
            prop_id = gap_data.get("proposition_id")
            if prop_id and prop_id not in existing_gap_prop_ids:
                gap = models.Gap(
                    id=str(uuid.uuid4()),
                    case_id=case_id,
                    proposition_id=prop_id,
                    title=gap_data.get("title", "Gap identified"),
                    why=gap_data.get("why", ""),
                    severity=gap_data.get("severity", "High"),
                    action=gap_data.get("action", ""),
                    source="ai",
                    status="open",
                )
                db.add(gap)

        # Recalculate readiness
        readiness = calculate_readiness(db, case_id)
        db.query(models.Case).filter_by(id=case_id).update({"readiness": readiness})

        db.query(models.Job).filter_by(id=job_id).update({
            "status": "done",
            "completed_at": datetime.utcnow(),
        })
        db.commit()

    except Exception as e:
        db.rollback()
        db.query(models.Job).filter_by(id=job_id).update({
            "status": "failed",
            "error": str(e),
        })
        db.query(models.Document).filter_by(id=document_id).update(
            {"processing_status": "failed"}
        )
        db.commit()
        raise
```

---

## 15. Frontend Changes (React Mockup → Real API)

All changes are **data layer only** — no visual changes needed.

### 15.1 Create `src/api.ts`

```typescript
const BASE = "http://localhost:8000/api"

function getToken() {
  return localStorage.getItem("token") ?? ""
}

function headers(isFormData = false) {
  const h: Record<string, string> = {
    Authorization: `Bearer ${getToken()}`,
  }
  if (!isFormData) h["Content-Type"] = "application/json"
  return h
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export const api = {
  login: (username: string, password: string) =>
    request<{ access_token: string }>("POST", "/auth/login", { username, password }),

  getCases: ()                       => request<CaseSummary[]>("GET",    "/cases"),
  createCase: (body: NewCaseDetails) => request<CaseSummary>("POST",   "/cases", body),
  getCase: (id: string)              => request<CaseDetail>("GET",     `/cases/${id}`),
  updateCase: (id: string, body: object) => request("PUT", `/cases/${id}`, body),

  addArticles: (caseId: string, articles: ArticleInput[]) =>
    request<{ job_id: string }>("POST", `/cases/${caseId}/articles`, { articles }),

  uploadDocument: async (caseId: string, file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    const res = await fetch(`${BASE}/cases/${caseId}/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body: fd,
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json() as Promise<{ document_id: string; job_id: string }>
  },

  getGraph: (caseId: string)          => request<GraphResponse>("GET",  `/cases/${caseId}/graph`),
  getGaps: (caseId: string)           => request<Gap[]>("GET",          `/cases/${caseId}/gaps`),
  createGap: (caseId: string, gap: object) => request("POST", `/cases/${caseId}/gaps`, gap),
  updateGap: (gapId: string, body: object) => request("PUT",  `/gaps/${gapId}`, body),

  pollJob: (jobId: string) => request<JobStatus>("GET", `/jobs/${jobId}`),
}

// Polling helper
export async function pollUntilDone(
  jobId: string,
  onDone: () => void,
  onError: (err: string) => void,
  intervalMs = 2000,
) {
  const tick = async () => {
    const job = await api.pollJob(jobId)
    if (job.status === "done") return onDone()
    if (job.status === "failed") return onError(job.error ?? "Job failed")
    setTimeout(tick, intervalMs)
  }
  setTimeout(tick, intervalMs)
}
```

### 15.2 Add Login gate to `App.tsx`

On mount, check for token in localStorage. If absent, show a simple login form. On successful login, store token and render the main app.

### 15.3 Replace static data in views

| File | What changes |
|---|---|
| `CasesList.tsx` | `useEffect` → `api.getCases()` on mount; pass live list down from App |
| `CaseWorkspace.tsx` | `api.getGraph(caseId)` for Overview and ArgumentGraph tabs |
| `CaseSetup.tsx` | `startBuild` calls `api.addArticles(...)` then `pollUntilDone(jobId, ...)` |
| `DocumentsInbox.tsx` | Upload calls `api.uploadDocument(...)` then `pollUntilDone(...)` |
| `UploadModal.tsx` | Same — real upload, poll for completion, refresh case on done |
| `CaseOverview.tsx` | Overview stats from `api.getCase(caseId)` |

### 15.4 Remove all `import { ... } from '../data'` from views

The only remaining use of `data.ts` should be the static EU regulation list in `CaseSetup.tsx` (that's UI-only, no need to fetch it).

---

## 16. Seed Script (`seed.py`)

```python
"""Run once to create the demo user and ensure DB is set up."""
import os
from sqlalchemy import create_engine, text
from passlib.context import CryptContext
from dotenv import load_dotenv
import uuid

load_dotenv()
pwd_ctx = CryptContext(schemes=["bcrypt"])

engine = create_engine(os.environ["DATABASE_URL"])

with engine.connect() as conn:
    conn.execute(text("""
        INSERT INTO users (id, username, password_hash)
        VALUES (:id, :username, :hash)
        ON CONFLICT (username) DO NOTHING
    """), {
        "id": str(uuid.uuid4()),
        "username": "admin",
        "hash": pwd_ctx.hash("scaffold2026"),
    })
    conn.commit()

print("Seeded: admin / scaffold2026")
```

---

## 17. Setup & Run Instructions

```bash
# 1. Create DB
createdb scaffold
psql scaffold < schema.sql

# 2. Install dependencies
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# 3. Configure env
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY

# 4. Seed user
python seed.py

# 5. Start backend
uvicorn app.main:app --reload --port 8000

# 6. Start frontend (separate terminal, in mockup directory)
npm run dev
```

Login credentials for demo: `admin` / `scaffold2026`

---

## 18. Build Order (8.5-Hour Plan)

| Hour | What to build | Files |
|---|---|---|
| **0–0.5** | Repo, venv, schema, .env | `schema.sql`, `requirements.txt`, `.env` |
| **0.5–1** | FastAPI skeleton + DB models + auth | `main.py`, `database.py`, `models.py`, `auth.py`, `deps.py`, `routers/auth.py`, `seed.py` |
| **1–1.5** | Cases CRUD | `schemas.py`, `routers/cases.py` |
| **1.5–2** | Jobs table + polling endpoint | `routers/jobs.py` |
| **2–3** | CELLAR + Claude + article/case-law fetch + graph build | `services/cellar.py`, `services/claude.py`, `services/graph_builder.py`, `routers/articles.py` |
| **3–4** | Document upload + PDF extraction + LLM analysis pipeline | `services/pdf.py`, `services/doc_analyser.py`, `routers/documents.py` |
| **4–4.5** | Graph CRUD (elements, propositions, evidence, gaps) | `routers/graph.py`, `routers/evidence.py`, `routers/gaps.py` |
| **4.5–5** | Readiness calculation + proposition status auto-update | `services/readiness.py` |
| **5–6.5** | Frontend: `api.ts`, login gate, wire CaseSetup, wire CasesList, wire graph view | `src/api.ts`, `App.tsx`, `CaseSetup.tsx`, `CasesList.tsx` |
| **6.5–7.5** | Frontend: wire document upload, wire CaseOverview stats | `UploadModal.tsx`, `CaseOverview.tsx` |
| **7.5–8** | End-to-end test of full flow, fix blockers | — |
| **8–8.5** | Backend/Frontend integration: flip live flag, validate all endpoints, delete mocks | `src/api/client.ts`, mock cleanup |

---

## 19. Key Edge Cases to Handle

1. **Gemini returns malformed JSON** — retry once with a stricter prompt asking for JSON only; if still fails, set job status to `failed` with error message
2. **CELLAR article not found** — return a clear error in the job result so the UI can prompt the user
3. **PDF with no extractable text** (scanned) — detect empty extraction, set `processing_status = 'failed'`, tell user OCR is not supported
4. **Duplicate evidence** — Gemini may map the same excerpt twice across documents; add a dedup check on `(proposition_id, excerpt[:100])`
5. **Token limits** — `doc_text[:50_000]` caps document input; for large bundles, consider splitting by page and running per-page analysis
6. **CORS** — FastAPI must allow `http://localhost:5173` in CORSMiddleware

---

## 20. Nice-to-Haves (Post-Hackathon)

- Export argument graph as PDF (WeasyPrint)
- Version history on elements/propositions (add `versions` table)
- DSA, AI Act, ePrivacy regulations (currently GDPR only)
- Multi-user with firm workspaces and roles
- Document drafting editor connected to argument graph
- Semantic search over evidence (pgvector)

---

## 20.5 Backend/Frontend Integration Phase (Hour 8–8.5)

Once all backend routes (§7) are complete and both frontend mock and backend are built, integration is a single phase:

1. **Bring up the backend** — ensure Postgres is running (`psql scaffold`), schema applied, user seeded, `uvicorn app.main:app --reload --port 8000` running
2. **Set `VITE_USE_MOCKS=false`** in `src/api/client.ts` (or export from `.env.local`) to flip from mock data to live API calls. Every `api.*` method already contains the real `fetch` against the documented routes.
3. **Walk the app end-to-end** — in dependency order (auth → cases → articles/build → documents/analyse → evidence/gaps):
   - Verify each screen renders correctly against the live API
   - Confirm the real response matches `src/types/` contracts
   - Fix the contract on whichever side is wrong (backend schema or frontend type)
4. **Delete mock artifacts** — once all endpoints are validated:
   - Delete `src/api/mockData.ts`
   - Remove mock branches + mirrored-logic helpers (`recalcReadiness`, `refreshPropositionStatus`, `finaliseJob`) from `src/api/client.ts`
   - Set `VITE_USE_MOCKS` default to `false` and remove the flag
5. **Final end-to-end test** — login → create case → add articles → wait for graph build → upload PDF → wait for analysis → verify evidence + gaps appear → check readiness score updates

---

## 21. Handoff

### What's done

**Setup (Hour 0–0.5)**
- `backend/` directory created with `app/`, `app/routers/`, `app/services/`, `uploads/`
- `requirements.txt` written (all 15 pinned packages, including `bcrypt==3.2.2` fix — see below)
- `schema.sql` written and applied — all 9 tables and 7 indexes live in the `scaffold` database
- `.env.example` written; `.env` copied from it (ANTHROPIC_API_KEY needed)
- `.gitignore` written for backend

**Backend skeleton (Hour 0.5–1)**
- `app/config.py` — Pydantic Settings, reads all 7 env vars from `.env`
- `app/database.py` — sync SQLAlchemy engine, `SessionLocal`, `Base`
- `app/models.py` — ORM classes for all 9 tables mirroring `schema.sql`
- `app/auth.py` — `create_access_token`, `verify_password`, `hash_password`
- `app/deps.py` — `get_db()`, `get_current_user()` with Bearer JWT decode
- `app/main.py` — FastAPI app, CORS allowing `localhost:5173`, auth router mounted at `/api`
- `app/routers/auth.py` — `POST /api/auth/login` verified returning a JWT
- `seed.py` — admin user seeded (`admin` / `scaffold2026`)

**Verified working:** `POST /api/auth/login` returns a valid JWT. Server starts cleanly with `uvicorn app.main:app --port 8000`.

**Cases CRUD (Hour 1–1.5)**
- `app/schemas.py` — all §7 Pydantic response/request schemas: `CaseSummary`, `CaseDetail` (with nested `ElementOut` → `PropositionOut` carrying `evidence_count`/`gap_count`), `NewCaseDetails`, `CaseUpdate`, `ArticleInput`, `CaseArticle`, `GraphResponse`, `JobStatus`, `Gap`, `Evidence`, `Document`, `DocumentDetail`, plus `OkResponse`. UUID/timestamp fields typed as `UUID`/`datetime` so ORM rows (using `as_uuid=True`) serialize to the JSON strings the frontend expects.
- `app/routers/cases.py` — all five routes, gated behind `get_current_user`:
  - `GET /api/cases` — all cases, `created_at desc`
  - `POST /api/cases` — creates with defaults (`status=Draft`, `claim_type=Pending`, `readiness=0`, `has_graph=False`); derives `short_name` mirroring the frontend's truncation rule in `client.ts` (`name[:26] + "…"` when > 28 chars)
  - `GET /api/cases/{id}` — `CaseDetail` with nested elements → propositions; evidence/gap counts batched into two grouped queries
  - `PUT /api/cases/{id}` — partial update via `exclude_unset`, re-derives `short_name` when `name` changes, bumps `updated_at`
  - `DELETE /api/cases/{id}` — FK cascade removes children, returns `{ok: true}`
- `app/main.py` — cases router mounted at `/api`.
- **Note:** `NewCaseDetails` defaults `client`/`court`/`reference` to `""` (only `name` is required), matching the DB column defaults.

**Verified working:** full CRUD tested end-to-end against the live `scaffold` DB — login → create → get detail (empty graph) → update (status change + long-name `short_name` truncation) → delete → delete-again-404. Auth gating (403 unauthenticated) and missing-case (404) both confirmed.

**Jobs polling endpoint (Hour 1.5–2)**
- `app/routers/jobs.py` — two pieces:
  - `create_job(db, case_id=None, job_type="", document_id=None) → Job` — shared helper that inserts a `pending` job row and returns it. Both `case_id` and `document_id` are optional (graph-build jobs have no document). Used by the articles and documents routers (next stages) to register background work before handing a `job_id` to the client.
  - `GET /api/jobs/{job_id}` — polling endpoint returning `JobStatus` (`id`, `status`, `job_type`, `error`, `completed_at`); 404 if not found. Gated behind `get_current_user`.
- `app/main.py` — jobs router imported and mounted at `/api`.

**Verified working:** app imports cleanly; `/api/jobs/{job_id}` route registered and confirmed via `python -c` import check.

**CELLAR + Claude (Hours 2–3) ✅ COMPLETE**
- `app/services/cellar.py` — EUR-Lex HTML fetching + CELLAR SPARQL querying for case law
  - `fetch_article_text()` — parses EUR-Lex HTML with fallback logic (ti-art → sti-art → text search)
  - `fetch_related_case_law()` — queries SPARQL for top 10 CJEU cases mentioning regulation + article
- `app/services/claude.py` — Claude 3.5 LLM integration
  - `build_argument_graph()` — formats articles + case law, calls Claude, parses JSON with elements/propositions
  - `analyse_document()` — truncates doc to 50k chars, maps evidence to propositions, suggests gaps
  - `_parse_json()` — strips markdown fences, parses JSON with error handling
- `app/services/graph_builder.py` — full pipeline orchestrator
  - `run_graph_build()` — fetch articles → case law → Claude → save elements/propositions to DB
  - Runs in BackgroundTasks with error handling (failed jobs logged to DB)
  - Updates case.has_graph=true and status="In Progress" on success
- `app/routers/articles.py` — two endpoints
  - `POST /api/cases/{case_id}/articles` — creates build_graph job, returns job_id for polling
  - `GET /api/cases/{case_id}/articles` — returns all case articles for a case
- Updated `app/config.py` to use ANTHROPIC_API_KEY (removed Gemini/CELLAR auth fields)
- Updated `requirements.txt` — replaced google-generativeai with anthropic==0.39.0
- Updated `.env` — corrected API key field
- Added `JobIdResponse` schema to `schemas.py`
- Fixed UUID validation in articles and jobs routers (prevents 500 on malformed IDs)
- Updated `app/main.py` to register articles router

**Verified working (full integration test):**
- ✅ Login → token issued
- ✅ Case creation → defaults applied
- ✅ POST /articles → job created and graph build queued
- ✅ Job polling → transitions pending → running → done
- ✅ Articles fetched from EUR-Lex (Art. 82, 32 tested)
- ✅ Claude builds 4 elements + 11-12 propositions from articles
- ✅ Database state updated (elements/propositions created, case.has_graph set)
- ✅ Error handling: missing case → 404, bad job ID → 404, no auth → 403
- ✅ API contracts match frontend types exactly (CaseSetup flow verified)

**Frontend (clickable mock prototype — NOT yet integrated)**

> ⚠️ **This frontend currently runs entirely on mock data. None of it is wired to the live backend yet.** It exists so we can visualise and click through the whole product flow before the endpoints exist. As each backend endpoint is built (§18), the corresponding mock must be replaced with the real call (see "go-live" steps below). Treat every screen as a UI contract to be validated against the real API, not as proven integration.

- `frontend/` built with React + Vite + **Tailwind v4** (installed via `@tailwindcss/vite`) + `react-router-dom`. The earlier Vite starter (counter demo) has been removed.
- Design tokens from `DESIGN_SYSTEM.md` are encoded as Tailwind theme variables in `src/index.css` (e.g. `bg-navy`, `text-primary`, `font-serif`).
- **Single backend seam:** `src/api/client.ts` exposes the exact `api.*` interface from §15.1 **plus** the graph/document/evidence/gap methods from §7. Every method already contains the real `fetch` call against `http://localhost:8000/api`, gated behind a `USE_MOCKS` flag (default `true`, override with `VITE_USE_MOCKS=false`). Today each method returns from an in-memory store seeded by `src/api/mockData.ts` (a worked GDPR Art. 82 case), with simulated latency and job polling.
- The mock layer **replicates backend rules** so the UI behaves correctly pre-integration: readiness calc (§8) and proposition/element status auto-update (§9) are mirrored in `client.ts`. These are demo stand-ins — the server remains the source of truth once live.
- `src/types/` holds TS contracts mirroring the §7 JSON shapes (keep in sync with `app/schemas.py`).
- Screens built and clickable end-to-end: `pages/Login.tsx` (auth gate, token in `localStorage`), `pages/CasesList.tsx`, `pages/CaseSetup.tsx` (article selection **+ litigation-bundle PDF upload** in one setup step → build graph, then analyse each document), `pages/CaseWorkspace.tsx` (tabs: Overview, Argument Graph + evidence side panel, Documents inbox + upload modal, Gaps). Feature tabs live in `src/features/`.
- Async ops use the §15.1 `pollUntilDone` helper against `GET /api/jobs/{id}` (wrapped as an `awaitJob` promise in `CaseSetup.tsx` for sequencing build → analyse).
- **Note:** file/component naming differs from §15's plan — logic is split into `pages/` (routed screens) and `features/` (workspace tabs) rather than flat files, and the API client is `src/api/client.ts` (not `src/api.ts`). `UploadModal` lives inside `features/DocumentsInbox.tsx`.
- **Verified:** `tsc -b` clean, `eslint` clean, `vite build` succeeds (Tailwind tokens compile). Not yet verified in a real browser with screenshots, and **never tested against the real backend.**

**Frontend go-live checklist (do this once the backend is fully built — see the integration stage in "What's next"):**
1. Start the backend on `http://localhost:8000`.
2. Set `VITE_USE_MOCKS=false` (or flip the `USE_MOCKS` default in `client.ts`).
3. Walk the app end-to-end and confirm each endpoint's real response matches `src/types/` and the screen renders correctly; fix the type/UI on whichever side is wrong.
4. Once all endpoints are validated, delete `src/api/mockData.ts` and the mock branches + mirrored-logic helpers (`recalcReadiness`, `refreshPropositionStatus`, `finaliseJob`) in `client.ts`.

---

### Known fixes applied (don't revert)

| Issue | Fix |
|---|---|
| Local Postgres has no `postgres` role | `DATABASE_URL` in `.env` uses `macbook` (the macOS username), not `postgres:postgres` |
| `passlib[bcrypt]==1.7.4` incompatible with `bcrypt>=4.0` — crashes on `bcrypt.__about__` | `bcrypt==3.2.2` pinned explicitly in `requirements.txt` |
| `TIMESTAMPTZ` not a valid SQLAlchemy dialect import | Replaced with `TS = DateTime(timezone=True)` alias in `models.py` |

---

### What's next (follow the build order in §18)

| Hour | Task | Status |
|---|---|---|
| **0–0.5** | Repo setup, schema, .env | ✅ Done |
| **0.5–1** | FastAPI skeleton, auth | ✅ Done |
| **1–1.5** | Cases CRUD | ✅ Done |
| **1.5–2** | Jobs polling | ✅ Done |
| **2–3** | CELLAR + Claude + articles endpoints | ✅ Done |
| **3–4** | Document upload + PDF extraction + LLM analysis | 🔜 Next |
| **4–4.5** | Graph CRUD + evidence + gaps | 🔜 Next |
| **4.5–5** | Readiness + proposition status auto-update | 🔜 Next |
| **5–7.5** | **Frontend integration** | 🔜 Next |
| **7.5–8** | End-to-end test + blockers | 🔜 Next |

---

### Frontend integration stage (after the backend is fully built)

The screens already exist as a mock prototype (see "What's done"). **Integration
is a single phase that happens once the backend is complete** — i.e. after all
routes in §7 are implemented and the rest of §18 is done. It is *not* done
incrementally during the backend build; the prototype stays fully mocked until
then. This stage is about *replacing mocks with real calls*, not building UI.

Because every endpoint exists by this point, the global `USE_MOCKS` flag is all
that's needed (no per-method switching):

1. Bring up the backend (Postgres running, schema applied, user seeded, `uvicorn`
   on `:8000`).
2. Set `VITE_USE_MOCKS=false` (or flip the `USE_MOCKS` default in
   `src/api/client.ts`). Every `api.*` method already contains the real `fetch`
   against the documented route.
3. Walk the app end-to-end and validate each screen against its endpoint, in
   dependency order: auth → cases CRUD → jobs polling → articles/graph build →
   documents/analysis → evidence/gaps. For each, confirm the real response
   matches `src/types/` and the screen renders; fix the contract on whichever
   side is wrong.
4. Once validated, set the default to live and delete `mockData.ts` plus the mock
   branches + mirrored-logic helpers (`recalcReadiness`,
   `refreshPropositionStatus`, `finaliseJob`) from `client.ts`.

---

### Environment setup for next session

```bash
# Start backend (from backend/)
source venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Start frontend (from frontend/)
npm run dev
```

`.env` needs a real `ANTHROPIC_API_KEY` for Claude AI features to work.
