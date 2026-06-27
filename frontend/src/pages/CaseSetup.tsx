/*
  Case setup (CLAUDE.md §15.3). Two things happen here before the workspace opens:
    1. Select the GDPR articles that found the claim.
    2. Upload the litigation bundle (one or more PDFs) — optional but typical.

  The GDPR article catalogue below is STATIC UI data (CLAUDE.md §15.4 says the
  regulation list stays client-side — it isn't fetched).

  On "Build", the pipeline runs in the order the backend requires — the graph
  must exist before documents can be mapped to its propositions:

    POST /api/cases/{id}/articles  -> { job_id }   (CELLAR fetch + Gemini build)
    poll GET /api/jobs/{id}         until "done"
    then, for each staged file:
      POST /api/cases/{id}/documents (multipart) -> { job_id }  (extract + analyse)
      poll GET /api/jobs/{id}        until "done"
    -> navigate to the workspace (GET /cases/{id}/graph returns the result).
*/
import { useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { api, pollUntilDone } from "../api/client"
import type { ArticleInput } from "../types"
import { Button, Card, Spinner } from "../components/ui"

// MVP scope is GDPR only (CLAUDE.md §1). CELEX 32016R0679 = GDPR.
const GDPR_CELEX = "32016R0679"
const GDPR_ARTICLES: { number: string; title: string; blurb: string }[] = [
  { number: "6", title: "Lawfulness of processing", blurb: "Legal bases for processing personal data" },
  { number: "9", title: "Processing of special categories", blurb: "Sensitive data — health, biometrics, etc." },
  { number: "15", title: "Right of access", blurb: "Data subject access requests" },
  { number: "17", title: "Right to erasure", blurb: "'Right to be forgotten'" },
  { number: "32", title: "Security of processing", blurb: "Technical & organisational measures" },
  { number: "33", title: "Notification of a breach", blurb: "72-hour breach notification to supervisory authority" },
  { number: "82", title: "Right to compensation and liability", blurb: "Material & non-material damages claim" },
  { number: "83", title: "General conditions for fines", blurb: "Administrative fines framework" },
]

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Promise wrapper around the callback-style pollUntilDone (CLAUDE.md §15.1). */
function awaitJob(jobId: string) {
  return new Promise<void>((resolve, reject) => {
    pollUntilDone(jobId, resolve, (err) => reject(new Error(err)))
  })
}

type Phase = "select" | "building" | "error"

export default function CaseSetup() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [selected, setSelected] = useState<Set<string>>(new Set(["82", "32"]))
  const [files, setFiles] = useState<File[]>([])
  const [phase, setPhase] = useState<Phase>("select")
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")

  function toggle(num: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(num)) next.delete(num)
      else next.add(num)
      return next
    })
  }

  function addFiles(list: FileList | null) {
    if (!list) return
    const pdfs = Array.from(list).filter((f) => f.type === "application/pdf")
    // De-dupe by name+size so re-picking the same file doesn't double-add.
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`))
      return [...prev, ...pdfs.filter((f) => !seen.has(`${f.name}:${f.size}`))]
    })
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  async function startBuild() {
    if (!caseId || selected.size === 0) return
    setPhase("building")
    setError("")

    const articles: ArticleInput[] = [...selected].map((number) => ({
      regulation_id: "gdpr",
      celex_id: GDPR_CELEX,
      article_number: number,
    }))

    try {
      // 1. Build the argument graph.
      setStatus("Fetching article text from EUR-Lex and building the argument graph…")
      const { job_id } = await api.addArticles(caseId, articles)
      await awaitJob(job_id)

      // 2. Upload + analyse each document in the bundle, in turn.
      for (let i = 0; i < files.length; i++) {
        setStatus(`Analysing document ${i + 1} of ${files.length}: ${files[i].name}…`)
        const res = await api.uploadDocument(caseId, files[i])
        await awaitJob(res.job_id)
      }

      navigate(`/cases/${caseId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed")
      setPhase("error")
    }
  }

  if (phase === "building") {
    return (
      <div className="mx-auto max-w-[600px] px-6 py-24 text-center">
        <Spinner label={status || "Setting up case…"} />
        <p className="mt-2 text-sm text-muted">
          Building the Elements → Propositions structure with Gemini, then mapping
          each uploaded document to the propositions it supports. This usually
          takes a few seconds.
        </p>
      </div>
    )
  }

  const inputCls = "hidden"

  return (
    <div className="mx-auto max-w-[900px] px-6 py-8">
      <button
        onClick={() => navigate("/cases")}
        className="mb-4 text-sm text-muted hover:text-primary cursor-pointer"
      >
        ← Back to cases
      </button>

      <h1 className="text-4xl text-navy">Set up case</h1>
      <p className="mt-2 max-w-prose text-base text-muted">
        Choose the GDPR articles that found this claim and upload the litigation
        bundle. Scaffold builds a structured argument graph — each{" "}
        <strong className="text-navy">Element</strong> is a legal requirement to
        prove, each <strong className="text-navy">Proposition</strong> a
        falsifiable sub-claim — then classifies your documents and maps them onto it.
      </p>

      {/* ── 1. Articles ──────────────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-2xl text-navy">1. Select regulation articles</h2>
        <div className="mt-3 mb-3 flex items-center gap-2">
          <span className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
            GDPR · Regulation (EU) 2016/679
          </span>
          <span className="text-xs text-muted">CELEX {GDPR_CELEX}</span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {GDPR_ARTICLES.map((art) => {
            const on = selected.has(art.number)
            return (
              <Card
                key={art.number}
                hover
                onClick={() => toggle(art.number)}
                className={`!p-4 ${on ? "ring-2 ring-primary" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={on}
                    readOnly
                    className="mt-1 h-4 w-4 accent-[#7c3aed]"
                  />
                  <div>
                    <p className="font-semibold text-navy">
                      Article {art.number} — {art.title}
                    </p>
                    <p className="mt-0.5 text-sm text-muted">{art.blurb}</p>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      </section>

      {/* ── 2. Litigation bundle ─────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="text-2xl text-navy">2. Upload litigation bundle</h2>
        <p className="mt-1 text-sm text-muted">
          Optional — PDFs only. Each document is classified and mapped to the
          argument graph after it's built. You can also add documents later from
          the case workspace.
        </p>

        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            addFiles(e.dataTransfer.files)
          }}
          className="mt-3 flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-6 text-center transition-colors hover:border-primary"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            multiple
            className={inputCls}
            onChange={(e) => addFiles(e.target.files)}
          />
          <p className="font-semibold text-navy">
            Click to choose PDFs, or drag &amp; drop
          </p>
          <p className="mt-1 text-xs text-muted">
            Text extraction only — scanned/OCR documents are not supported
            (CLAUDE.md §19).
          </p>
        </div>

        {files.length > 0 && (
          <div className="mt-4 space-y-2">
            {files.map((f, i) => (
              <div
                key={`${f.name}:${f.size}`}
                className="flex items-center justify-between rounded-md border border-border bg-surface px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-error/10 text-error text-[11px] font-semibold">
                    PDF
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-navy">{f.name}</p>
                    <p className="text-xs text-muted">{formatBytes(f.size)}</p>
                  </div>
                </div>
                <button
                  onClick={() => removeFile(i)}
                  className="text-sm text-muted hover:text-error cursor-pointer"
                  aria-label={`Remove ${f.name}`}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {phase === "error" && (
        <p className="mt-6 text-sm text-error">Setup failed: {error}</p>
      )}

      <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
        <p className="text-sm text-muted">
          {selected.size} article{selected.size === 1 ? "" : "s"} ·{" "}
          {files.length} document{files.length === 1 ? "" : "s"}
        </p>
        <Button onClick={startBuild} disabled={selected.size === 0}>
          {files.length > 0
            ? "Build graph & analyse bundle →"
            : "Build argument graph →"}
        </Button>
      </div>
    </div>
  )
}
