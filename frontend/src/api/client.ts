/*
  ──────────────────────────────────────────────────────────────────────────
  API CLIENT
  ──────────────────────────────────────────────────────────────────────────
  The single seam between the frontend and the FastAPI backend. Every screen
  talks to the backend ONLY through the `api` object exported here.

  All methods issue real `fetch` calls against the backend (default
  http://localhost:8000/api, override with VITE_API_BASE). The bearer token
  set at login is read from localStorage and attached to every request.

  Method signatures mirror CLAUDE.md §15.1 plus the graph/document/evidence/gap
  endpoints from §7. Response shapes are validated against src/types.
*/
import type {
  ArticleInput,
  CaseArticle,
  CaseDetail,
  CaseSummary,
  DocumentDetail,
  DocumentItem,
  Evidence,
  EvidenceClassification,
  Gap,
  GraphResponse,
  JobStatus,
  NewCaseDetails,
} from "../types"

const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000/api"

// ── Token handling (bearer auth) ─────────────────────────────────────────────
function getToken() {
  return localStorage.getItem("token") ?? ""
}
function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getToken()}`,
  }
}

/** Thin fetch wrapper used by all JSON calls. */
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<T>
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────
export const api = {
  // ── Auth — POST /api/auth/login ───────────────────────────────────────────
  login(username: string, password: string): Promise<{ access_token: string }> {
    return request("POST", "/auth/login", { username, password })
  },

  // ── Cases ───────────────────────────────────────────────────────────────
  getCases(): Promise<CaseSummary[]> {
    return request("GET", "/cases")
  },

  createCase(body: NewCaseDetails): Promise<CaseSummary> {
    return request("POST", "/cases", body)
  },

  getCase(id: string): Promise<CaseDetail> {
    return request("GET", `/cases/${id}`)
  },

  updateCase(id: string, body: Partial<CaseSummary>): Promise<CaseSummary> {
    return request("PUT", `/cases/${id}`, body)
  },

  deleteCase(id: string): Promise<{ ok: boolean }> {
    return request("DELETE", `/cases/${id}`)
  },

  // ── Articles & graph build (async job) ────────────────────────────────────
  // POST /api/cases/{id}/articles -> { job_id }. Backend runs CELLAR->Claude->DB
  // in BackgroundTasks; frontend polls GET /jobs/{id}. (CLAUDE.md §7, §13)
  addArticles(caseId: string, articles: ArticleInput[]): Promise<{ job_id: string }> {
    return request("POST", `/cases/${caseId}/articles`, { articles })
  },

  getArticles(caseId: string): Promise<CaseArticle[]> {
    return request("GET", `/cases/${caseId}/articles`)
  },

  // ── Argument graph ────────────────────────────────────────────────────────
  getGraph(caseId: string): Promise<GraphResponse> {
    return request("GET", `/cases/${caseId}/graph`)
  },

  // ── Documents (upload + async analysis) ───────────────────────────────────
  // POST /api/cases/{id}/documents (multipart) -> { document_id, job_id }, then
  // poll GET /jobs/{id} until "done" (PDF extract + Claude analysis writes
  // evidence + AI-suggested gaps and recalculates readiness).
  async uploadDocument(
    caseId: string,
    file: File,
  ): Promise<{ document_id: string; job_id: string }> {
    const fd = new FormData()
    fd.append("file", file)
    const res = await fetch(`${BASE}/cases/${caseId}/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` }, // no Content-Type — browser sets multipart boundary
      body: fd,
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },

  getDocuments(caseId: string): Promise<DocumentItem[]> {
    return request("GET", `/cases/${caseId}/documents`)
  },

  getDocument(documentId: string): Promise<DocumentDetail> {
    return request("GET", `/documents/${documentId}`)
  },

  // ── Evidence ──────────────────────────────────────────────────────────────
  getEvidence(propositionId: string): Promise<Evidence[]> {
    return request("GET", `/propositions/${propositionId}/evidence`)
  },

  addEvidence(
    propositionId: string,
    body: {
      document_id: string
      excerpt: string
      classification: EvidenceClassification
      source_ref: string
    },
  ): Promise<Evidence> {
    return request("POST", `/propositions/${propositionId}/evidence`, body)
  },

  // ── Gaps ────────────────────────────────────────────────────────────────
  getGaps(caseId: string): Promise<Gap[]> {
    return request("GET", `/cases/${caseId}/gaps`)
  },

  createGap(caseId: string, gap: Partial<Gap> & { title: string }): Promise<Gap> {
    return request("POST", `/cases/${caseId}/gaps`, gap)
  },

  updateGap(gapId: string, body: Partial<Gap>): Promise<Gap> {
    return request("PUT", `/gaps/${gapId}`, body)
  },

  // ── Jobs (polling) — GET /api/jobs/{id} ───────────────────────────────────
  pollJob(jobId: string): Promise<JobStatus> {
    return request("GET", `/jobs/${jobId}`)
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Polling helper (CLAUDE.md §15.1) — used by CaseSetup / document uploads.
// ─────────────────────────────────────────────────────────────────────────────
export function pollUntilDone(
  jobId: string,
  onDone: () => void,
  onError: (err: string) => void,
  intervalMs = 2000,
) {
  const tick = async () => {
    try {
      const job = await api.pollJob(jobId)
      if (job.status === "done") return onDone()
      if (job.status === "failed") return onError(job.error ?? "Job failed")
      setTimeout(tick, intervalMs)
    } catch (e) {
      onError(e instanceof Error ? e.message : "Polling failed")
    }
  }
  setTimeout(tick, intervalMs)
}
