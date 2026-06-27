/*
  Shared TypeScript types for the Scaffold frontend.

  These mirror the JSON shapes documented in CLAUDE.md §7 (Full API Specification).
  When the backend lands, these are the contracts the real endpoints must satisfy —
  keep them in sync with `app/schemas.py` on the FastAPI side.
*/

export type CaseStatus = "Draft" | "In Progress" | "Filed" | "Closed"
export type ElementStatus = "Established" | "Contested" | "Gap"
export type PropositionStatus = ElementStatus
export type EvidenceClassification = "Supportive" | "Adverse" | "Neutral"
export type GapSeverity = "Critical" | "High" | "Medium"
export type GapStatus = "open" | "resolved"
export type AddedBy = "ai" | "human"
export type DocStatus = "pending" | "processing" | "done" | "failed"
export type JobType = "build_graph" | "analyse_document"
export type JobState = "pending" | "running" | "done" | "failed"

/** GET /api/cases — list item */
export interface CaseSummary {
  id: string
  name: string
  short_name: string
  client: string
  court: string
  reference: string
  status: CaseStatus
  claim_type: string
  lead: string
  readiness: number // 0–100, see CLAUDE.md §8
  has_graph: boolean
  created_at: string
  updated_at: string
}

/** Body for POST /api/cases */
export interface NewCaseDetails {
  name: string
  client: string
  court: string
  reference: string
}

/** GET /api/cases/{id} — detail (summary + nested graph) */
export interface CaseDetail extends CaseSummary {
  elements: Element[]
}

export interface Element {
  id: string
  label: string // 'E1', 'E2', ...
  title: string
  status: ElementStatus
  source: string // e.g. 'Art. 82 GDPR'
  position: number
  propositions: Proposition[]
}

export interface Proposition {
  id: string
  label: string // 'E1-P1', ...
  title: string
  status: PropositionStatus
  position: number
  evidence_count: number
  gap_count: number
}

/** GET /api/cases/{id}/graph */
export interface GraphResponse {
  elements: Element[]
}

/** Body item for POST /api/cases/{id}/articles */
export interface ArticleInput {
  regulation_id: string // 'gdpr'
  celex_id: string // '32016R0679'
  article_number: string // '82'
}

export interface CaseArticle extends ArticleInput {
  id: string
  case_id: string
  article_title: string
  article_text: string
  fetched_at: string
}

export interface Evidence {
  id: string
  document_id: string
  proposition_id: string
  excerpt: string
  classification: EvidenceClassification
  source_ref: string
  added_by: AddedBy
  created_at: string
  /** Convenience for display — the originating document's filename. */
  document_filename?: string
}

export interface Gap {
  id: string
  case_id: string
  proposition_id: string | null
  title: string
  why: string
  severity: GapSeverity
  action: string
  source: AddedBy
  status: GapStatus
  created_at: string
}

export interface DocumentItem {
  id: string
  case_id: string
  filename: string
  file_size_bytes: number
  file_type: string // 'pdf' | 'docx' | 'eml' | 'csv'
  doc_type: string | null
  processing_status: DocStatus
  uploaded_at: string
  processed_at: string | null
}

export interface DocumentDetail extends DocumentItem {
  evidence: Evidence[]
}

/** GET /api/jobs/{id} */
export interface JobStatus {
  id: string
  status: JobState
  job_type: JobType
  error: string | null
  completed_at: string | null
}
