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
  regulation_id   TEXT NOT NULL,
  celex_id        TEXT NOT NULL,
  article_number  TEXT NOT NULL,
  article_title   TEXT NOT NULL DEFAULT '',
  article_text    TEXT NOT NULL DEFAULT '',
  fetched_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Argument graph: Elements
CREATE TABLE elements (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id    UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  title      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'Gap',
  source     TEXT NOT NULL DEFAULT '',
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Argument graph: Propositions
CREATE TABLE propositions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  element_id UUID NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
  case_id    UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  title      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'Gap',
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
  file_type         TEXT NOT NULL DEFAULT 'pdf',
  doc_type          TEXT,
  extracted_text    TEXT,
  processing_status TEXT NOT NULL DEFAULT 'pending',
  uploaded_at       TIMESTAMPTZ DEFAULT NOW(),
  processed_at      TIMESTAMPTZ
);

-- Evidence items linking document excerpts to propositions
CREATE TABLE evidence (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id      UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  proposition_id   UUID NOT NULL REFERENCES propositions(id) ON DELETE CASCADE,
  excerpt          TEXT NOT NULL,
  classification   TEXT NOT NULL,
  source_ref       TEXT NOT NULL DEFAULT '',
  added_by         TEXT NOT NULL DEFAULT 'ai',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Gaps
CREATE TABLE gaps (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id        UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  proposition_id UUID REFERENCES propositions(id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  why            TEXT NOT NULL DEFAULT '',
  severity       TEXT NOT NULL DEFAULT 'High',
  action         TEXT NOT NULL DEFAULT '',
  source         TEXT NOT NULL DEFAULT 'ai',
  status         TEXT NOT NULL DEFAULT 'open',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Async job tracking
CREATE TABLE jobs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id      UUID REFERENCES cases(id) ON DELETE CASCADE,
  document_id  UUID REFERENCES documents(id) ON DELETE CASCADE,
  job_type     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  result       JSONB,
  error        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_elements_case     ON elements(case_id);
CREATE INDEX idx_propositions_case ON propositions(case_id);
CREATE INDEX idx_propositions_elem ON propositions(element_id);
CREATE INDEX idx_evidence_prop     ON evidence(proposition_id);
CREATE INDEX idx_gaps_case         ON gaps(case_id);
CREATE INDEX idx_jobs_case         ON jobs(case_id);
CREATE INDEX idx_documents_case    ON documents(case_id);
