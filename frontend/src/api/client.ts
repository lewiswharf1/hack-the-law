/*
  ──────────────────────────────────────────────────────────────────────────
  DROP-IN API CLIENT
  ──────────────────────────────────────────────────────────────────────────
  This is the single seam between the frontend and the backend. Every screen
  talks to the backend ONLY through the `api` object exported here — no
  component imports mock data directly.

  Right now `USE_MOCKS = true`, so each method resolves against an in-memory
  store seeded from ./mockData.ts (with simulated network latency and job
  polling, so the UI behaves like the real thing).

  TO GO LIVE once the FastAPI endpoints exist (CLAUDE.md §7):
    1. Set USE_MOCKS = false (or VITE_USE_MOCKS=false in .env).
    2. That's it — every method already contains the real `fetch` call against
       http://localhost:8000/api, matching the documented routes. The mock
       branch is dead code you can then delete along with ./mockData.ts.

  The method signatures here are exactly those in CLAUDE.md §15.1 plus the graph/
  document/evidence/gap endpoints from §7.
*/
import type {
  ArticleInput,
  CaseArticle,
  CaseDetail,
  CaseSummary,
  DocumentDetail,
  DocumentItem,
  Element,
  Evidence,
  EvidenceClassification,
  Gap,
  GraphResponse,
  JobStatus,
  NewCaseDetails,
} from "../types"
import * as mock from "./mockData"

const BASE = "http://localhost:8000/api"

// Flip to false (or set VITE_USE_MOCKS=false) when the backend is up.
const USE_MOCKS =
  (import.meta.env.VITE_USE_MOCKS ?? "true") !== "false"

// ── Token handling (real-backend auth) ──────────────────────────────────────
function getToken() {
  return localStorage.getItem("token") ?? ""
}
function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getToken()}`,
  }
}

/** Thin fetch wrapper used by all real-backend calls. */
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<T>
}

// ── Mock helpers ─────────────────────────────────────────────────────────────
const delay = (ms = 350) => new Promise((r) => setTimeout(r, ms))
let idCounter = 1000
const newId = (prefix: string) => `${prefix}-${++idCounter}`
const nowIso = () => new Date().toISOString()

/*
  In-memory mutable store, deep-cloned from the static fixtures so demo edits
  (new cases, uploaded docs, added evidence) persist for the session without
  mutating the source fixtures.
*/
const store = {
  cases: structuredClone(mock.mockCases) as CaseSummary[],
  articles: structuredClone(mock.mockArticles) as Record<string, CaseArticle[]>,
  elements: structuredClone(mock.mockElements) as Record<string, Element[]>,
  evidence: structuredClone(mock.mockEvidence) as Record<string, Evidence[]>,
  documents: structuredClone(mock.mockDocuments) as Record<string, DocumentItem[]>,
  gaps: structuredClone(mock.mockGaps) as Record<string, Gap[]>,
  // job_id -> when it should report "done"
  jobs: {} as Record<string, { type: JobStatus["job_type"]; doneAt: number }>,
}

/** Mirror of backend readiness calc (CLAUDE.md §8) for the mock graph build. */
function recalcReadiness(caseId: string) {
  const props = (store.elements[caseId] ?? []).flatMap((e) => e.propositions)
  const c = store.cases.find((x) => x.id === caseId)
  if (!c) return
  if (props.length === 0) {
    c.readiness = 0
    return
  }
  const score = props.reduce(
    (acc, p) =>
      acc + (p.status === "Established" ? 1 : p.status === "Contested" ? 0.5 : 0),
    0,
  )
  c.readiness = Math.round((score / props.length) * 100)
}

// A demo graph the mock "build" produces for any case (shape mirrors Gemini output).
function demoGraphForCase(): Element[] {
  // Reuse the worked GDPR example structure but reset statuses to Gap, as a
  // freshly-built graph would have no evidence yet.
  return structuredClone(mock.mockElements["case-1"]).map((el) => ({
    ...el,
    id: newId("el"),
    status: "Gap" as const,
    propositions: el.propositions.map((p) => ({
      ...p,
      id: newId("p"),
      status: "Gap" as const,
      evidence_count: 0,
      gap_count: 0,
    })),
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────
export const api = {
  // ── Auth — POST /api/auth/login ───────────────────────────────────────────
  async login(username: string, password: string): Promise<{ access_token: string }> {
    if (!USE_MOCKS) return request("POST", "/auth/login", { username, password })
    await delay()
    // Demo credentials from CLAUDE.md §16.
    if (username === "admin" && password === "scaffold2026") {
      return { access_token: "mock-jwt-token" }
    }
    throw new Error("Invalid credentials (try admin / scaffold2026)")
  },

  // ── Cases ───────────────────────────────────────────────────────────────
  async getCases(): Promise<CaseSummary[]> {
    if (!USE_MOCKS) return request("GET", "/cases")
    await delay()
    return structuredClone(store.cases)
  },

  async createCase(body: NewCaseDetails): Promise<CaseSummary> {
    if (!USE_MOCKS) return request("POST", "/cases", body)
    await delay()
    const short = body.name.length > 28 ? body.name.slice(0, 26) + "…" : body.name
    const c: CaseSummary = {
      id: newId("case"),
      name: body.name,
      short_name: short,
      client: body.client,
      court: body.court,
      reference: body.reference,
      status: "Draft",
      claim_type: "Pending",
      lead: "LW",
      readiness: 0,
      has_graph: false,
      created_at: nowIso(),
      updated_at: nowIso(),
    }
    store.cases.unshift(c)
    return structuredClone(c)
  },

  async getCase(id: string): Promise<CaseDetail> {
    if (!USE_MOCKS) return request("GET", `/cases/${id}`)
    await delay()
    const c = store.cases.find((x) => x.id === id)
    if (!c) throw new Error("Case not found")
    return { ...structuredClone(c), elements: structuredClone(store.elements[id] ?? []) }
  },

  async updateCase(id: string, body: Partial<CaseSummary>): Promise<CaseSummary> {
    if (!USE_MOCKS) return request("PUT", `/cases/${id}`, body)
    await delay()
    const c = store.cases.find((x) => x.id === id)
    if (!c) throw new Error("Case not found")
    Object.assign(c, body, { updated_at: nowIso() })
    return structuredClone(c)
  },

  // ── Articles & graph build (async job) ────────────────────────────────────
  // POST /api/cases/{id}/articles -> { job_id }. Backend runs CELLAR->Gemini->DB
  // in BackgroundTasks; frontend polls GET /jobs/{id}. (CLAUDE.md §7, §13)
  async addArticles(caseId: string, articles: ArticleInput[]): Promise<{ job_id: string }> {
    if (!USE_MOCKS) return request("POST", `/cases/${caseId}/articles`, { articles })
    await delay()
    // Persist selected articles + queue a "build_graph" job that finishes in ~3s.
    store.articles[caseId] = articles.map((a) => ({
      ...a,
      id: newId("art"),
      case_id: caseId,
      article_title: "",
      article_text: "",
      fetched_at: nowIso(),
    }))
    const jobId = newId("job")
    store.jobs[jobId] = { type: "build_graph", doneAt: Date.now() + 3000 }
    // Stash which case this job builds, so pollJob can finalise it.
    pendingBuilds[jobId] = { caseId, articles }
    return { job_id: jobId }
  },

  async getArticles(caseId: string): Promise<CaseArticle[]> {
    if (!USE_MOCKS) return request("GET", `/cases/${caseId}/articles`)
    await delay()
    return structuredClone(store.articles[caseId] ?? [])
  },

  // ── Argument graph ────────────────────────────────────────────────────────
  async getGraph(caseId: string): Promise<GraphResponse> {
    if (!USE_MOCKS) return request("GET", `/cases/${caseId}/graph`)
    await delay()
    return { elements: structuredClone(store.elements[caseId] ?? []) }
  },

  // ── Documents (upload + async analysis) ───────────────────────────────────
  // POST /api/cases/{id}/documents (multipart) -> { document_id, job_id }.
  // NOTE: real upload uses FormData, not JSON — see real branch below.
  async uploadDocument(
    caseId: string,
    file: File,
  ): Promise<{ document_id: string; job_id: string }> {
    if (!USE_MOCKS) {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch(`${BASE}/cases/${caseId}/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` }, // no Content-Type — browser sets multipart boundary
        body: fd,
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    }
    await delay()
    const docId = newId("doc")
    const doc: DocumentItem = {
      id: docId,
      case_id: caseId,
      filename: file.name,
      file_size_bytes: file.size,
      doc_type: null,
      processing_status: "processing",
      uploaded_at: nowIso(),
      processed_at: null,
    }
    ;(store.documents[caseId] ??= []).unshift(doc)
    const jobId = newId("job")
    store.jobs[jobId] = { type: "analyse_document", doneAt: Date.now() + 2500 }
    pendingAnalyses[jobId] = { caseId, docId }
    return { document_id: docId, job_id: jobId }
  },

  async getDocuments(caseId: string): Promise<DocumentItem[]> {
    if (!USE_MOCKS) return request("GET", `/cases/${caseId}/documents`)
    await delay()
    return structuredClone(store.documents[caseId] ?? [])
  },

  async getDocument(documentId: string): Promise<DocumentDetail> {
    if (!USE_MOCKS) return request("GET", `/documents/${documentId}`)
    await delay()
    for (const docs of Object.values(store.documents)) {
      const d = docs.find((x) => x.id === documentId)
      if (d) {
        const evidence = Object.values(store.evidence)
          .flat()
          .filter((e) => e.document_id === documentId)
        return { ...structuredClone(d), evidence: structuredClone(evidence) }
      }
    }
    throw new Error("Document not found")
  },

  // ── Evidence ──────────────────────────────────────────────────────────────
  async getEvidence(propositionId: string): Promise<Evidence[]> {
    if (!USE_MOCKS) return request("GET", `/propositions/${propositionId}/evidence`)
    await delay()
    return structuredClone(store.evidence[propositionId] ?? [])
  },

  async addEvidence(
    propositionId: string,
    body: {
      document_id: string
      excerpt: string
      classification: EvidenceClassification
      source_ref: string
    },
  ): Promise<Evidence> {
    if (!USE_MOCKS)
      return request("POST", `/propositions/${propositionId}/evidence`, body)
    await delay()
    const ev: Evidence = {
      id: newId("ev"),
      proposition_id: propositionId,
      added_by: "human",
      created_at: nowIso(),
      ...body,
    }
    ;(store.evidence[propositionId] ??= []).push(ev)
    refreshPropositionStatus(propositionId)
    return structuredClone(ev)
  },

  // ── Gaps ────────────────────────────────────────────────────────────────
  async getGaps(caseId: string): Promise<Gap[]> {
    if (!USE_MOCKS) return request("GET", `/cases/${caseId}/gaps`)
    await delay()
    return structuredClone(store.gaps[caseId] ?? [])
  },

  async createGap(
    caseId: string,
    gap: Partial<Gap> & { title: string },
  ): Promise<Gap> {
    if (!USE_MOCKS) return request("POST", `/cases/${caseId}/gaps`, gap)
    await delay()
    const g: Gap = {
      id: newId("gap"),
      case_id: caseId,
      proposition_id: gap.proposition_id ?? null,
      title: gap.title,
      why: gap.why ?? "",
      severity: gap.severity ?? "High",
      action: gap.action ?? "",
      source: "human",
      status: "open",
      created_at: nowIso(),
    }
    ;(store.gaps[caseId] ??= []).push(g)
    return structuredClone(g)
  },

  async updateGap(gapId: string, body: Partial<Gap>): Promise<Gap> {
    if (!USE_MOCKS) return request("PUT", `/gaps/${gapId}`, body)
    await delay()
    for (const gaps of Object.values(store.gaps)) {
      const g = gaps.find((x) => x.id === gapId)
      if (g) {
        Object.assign(g, body)
        return structuredClone(g)
      }
    }
    throw new Error("Gap not found")
  },

  // ── Jobs (polling) — GET /api/jobs/{id} ───────────────────────────────────
  async pollJob(jobId: string): Promise<JobStatus> {
    if (!USE_MOCKS) return request("GET", `/jobs/${jobId}`)
    await delay(200)
    const job = store.jobs[jobId]
    if (!job) throw new Error("Job not found")
    const done = Date.now() >= job.doneAt
    if (done) finaliseJob(jobId, job.type)
    return {
      id: jobId,
      status: done ? "done" : "running",
      job_type: job.type,
      error: null,
      completed_at: done ? nowIso() : null,
    }
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Polling helper (verbatim from CLAUDE.md §15.1) — used by CaseSetup / uploads.
// ─────────────────────────────────────────────────────────────────────────────
export function pollUntilDone(
  jobId: string,
  onDone: () => void,
  onError: (err: string) => void,
  intervalMs = 1000,
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

// ─────────────────────────────────────────────────────────────────────────────
// Mock-only job finalisation. In the real backend, BackgroundTasks does all of
// this server-side (CLAUDE.md §13–14); here we replicate the observable result
// the moment a job's timer elapses.
// ─────────────────────────────────────────────────────────────────────────────
const pendingBuilds: Record<string, { caseId: string; articles: ArticleInput[] }> = {}
const pendingAnalyses: Record<string, { caseId: string; docId: string }> = {}

function finaliseJob(jobId: string, type: JobStatus["job_type"]) {
  if (type === "build_graph" && pendingBuilds[jobId]) {
    const { caseId, articles } = pendingBuilds[jobId]
    if (!store.elements[caseId]?.length) {
      store.elements[caseId] = demoGraphForCase()
    }
    const c = store.cases.find((x) => x.id === caseId)
    if (c) {
      c.has_graph = true
      c.status = "In Progress"
      c.claim_type = articles.map((a) => `Art. ${a.article_number} GDPR`).join(", ")
    }
    recalcReadiness(caseId)
    delete pendingBuilds[jobId]
  }

  if (type === "analyse_document" && pendingAnalyses[jobId]) {
    const { caseId, docId } = pendingAnalyses[jobId]
    const doc = store.documents[caseId]?.find((d) => d.id === docId)
    if (doc) {
      doc.processing_status = "done"
      doc.doc_type = "Expert Report"
      doc.processed_at = nowIso()
    }
    // Demo: attach one AI evidence item to the first proposition with no evidence.
    const firstProp = (store.elements[caseId] ?? [])
      .flatMap((e) => e.propositions)
      .find((p) => (store.evidence[p.id] ?? []).length === 0)
    if (firstProp) {
      ;(store.evidence[firstProp.id] ??= []).push({
        id: newId("ev"),
        document_id: docId,
        proposition_id: firstProp.id,
        excerpt:
          "[AI-extracted excerpt] Newly uploaded document provides supporting material for this proposition.",
        classification: "Supportive",
        source_ref: "p.1",
        added_by: "ai",
        created_at: nowIso(),
        document_filename: doc?.filename,
      })
      refreshPropositionStatus(firstProp.id)
    }
    delete pendingAnalyses[jobId]
  }
}

/** Mirror of backend proposition status auto-update (CLAUDE.md §9). */
function refreshPropositionStatus(propId: string) {
  const evidence = store.evidence[propId] ?? []
  let status: Element["status"] = "Gap"
  if (evidence.length > 0) {
    const supportive = evidence.filter((e) => e.classification === "Supportive").length
    const adverse = evidence.filter((e) => e.classification === "Adverse").length
    status = supportive > 0 && adverse === 0 ? "Established" : "Contested"
  }
  for (const [caseId, els] of Object.entries(store.elements)) {
    for (const el of els) {
      const p = el.propositions.find((x) => x.id === propId)
      if (p) {
        p.status = status
        p.evidence_count = evidence.length
        // Element status = worst-case child (CLAUDE.md §9).
        const childStatuses = el.propositions.map((x) => x.status)
        el.status = childStatuses.includes("Gap")
          ? "Gap"
          : childStatuses.includes("Contested")
            ? "Contested"
            : "Established"
        recalcReadiness(caseId)
        return
      }
    }
  }
}
