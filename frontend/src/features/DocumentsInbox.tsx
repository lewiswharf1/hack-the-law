/*
  Documents inbox + upload (CLAUDE.md §15.3).

  Backend:
    GET  /api/cases/{id}/documents            -> list
    POST /api/cases/{id}/documents (multipart)-> { document_id, job_id }
         then poll GET /api/jobs/{id} until "done" (PDF extract + Gemini analysis
         that writes evidence + AI-suggested gaps and recalculates readiness).
*/
import { useRef, useState } from "react"
import { api, pollUntilDone } from "../api/client"
import type { DocumentItem } from "../types"
import { Button, Card, Modal } from "../components/ui"

const DOC_TYPE_COLOR: Record<string, string> = {
  "Expert Report": "bg-primary/10 text-primary",
  Judgment: "bg-info/10 text-info",
  "Witness Statement": "bg-success/10 text-success",
  Correspondence: "bg-warning/10 text-warning",
  Regulation: "bg-navy/10 text-navy",
}

const FILE_TYPE_COLOR: Record<string, string> = {
  pdf: "bg-error/10 text-error",
  docx: "bg-warning/10 text-warning",
  eml: "bg-info/10 text-info",
  csv: "bg-success/10 text-success",
}

const FILE_TYPE_LABEL: Record<string, string> = {
  pdf: "PDF",
  docx: "DOC",
  eml: "EMAIL",
  csv: "CSV",
}

function getFileType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase()
  return ext === "docx"
    ? "docx"
    : ext === "eml"
      ? "eml"
      : ext === "csv"
        ? "csv"
        : "pdf"
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  pending: { text: "Queued", cls: "text-muted" },
  processing: { text: "Analysing…", cls: "text-info" },
  done: { text: "Analysed", cls: "text-success" },
  failed: { text: "Failed", cls: "text-error" },
}

export default function DocumentsInbox({
  documents,
  caseId,
  onChanged,
}: {
  documents: DocumentItem[]
  caseId: string
  onChanged: () => void
}) {
  const [showUpload, setShowUpload] = useState(false)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-xl text-navy">Document bundle</h3>
          <p className="text-sm text-muted">
            {documents.length} document{documents.length === 1 ? "" : "s"} ·
            classified and mapped to propositions automatically
          </p>
        </div>
        <Button onClick={() => setShowUpload(true)}>+ Upload document</Button>
      </div>

      {documents.length === 0 ? (
        <Card className="text-center text-muted">
          No documents yet. Upload a document (PDF, Word, Email, or CSV) to have it
          classified and mapped to the argument graph.
        </Card>
      ) : (
        <div className="space-y-3">
          {documents.map((d) => {
            const status = STATUS_LABEL[d.processing_status]
            // Fallback to detecting file type from filename if API doesn't provide it
            const detectedFileType = d.file_type || getFileType(d.filename)
            const fileTypeLabel = FILE_TYPE_LABEL[detectedFileType] ?? detectedFileType?.toUpperCase() ?? "FILE"
            const fileTypeColor = FILE_TYPE_COLOR[detectedFileType] ?? "bg-subtle text-navy"
            return (
              <Card key={d.id} className="!p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex h-9 w-9 items-center justify-center rounded-md text-xs font-semibold ${fileTypeColor}`}>
                      {fileTypeLabel}
                    </span>
                    <div>
                      <p className="font-semibold text-navy">{d.filename}</p>
                      <p className="text-xs text-muted">
                        {formatBytes(d.file_size_bytes)} · uploaded{" "}
                        {new Date(d.uploaded_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {d.doc_type && (
                      <span
                        className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                          DOC_TYPE_COLOR[d.doc_type] ?? "bg-subtle text-navy"
                        }`}
                      >
                        {d.doc_type}
                      </span>
                    )}
                    <span className={`text-xs font-semibold ${status.cls}`}>
                      {d.processing_status === "processing" && (
                        <span className="mr-1 inline-block h-2 w-2 animate-spin-slow rounded-full border-2 border-info border-t-transparent align-middle" />
                      )}
                      {status.text}
                    </span>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <UploadModal
        open={showUpload}
        caseId={caseId}
        onClose={() => setShowUpload(false)}
        onChanged={onChanged}
      />
    </div>
  )
}

// ── Upload modal (CLAUDE.md §15.3 UploadModal.tsx) ──────────────────────────
function UploadModal({
  open,
  caseId,
  onClose,
  onChanged,
}: {
  open: boolean
  caseId: string
  onClose: () => void
  onChanged: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<"idle" | "uploading" | "analysing" | "error">("idle")
  const [error, setError] = useState("")

  function reset() {
    setFile(null)
    setPhase("idle")
    setError("")
  }

  async function handleUpload() {
    if (!file) return
    setPhase("uploading")
    try {
      const { job_id } = await api.uploadDocument(caseId, file)
      setPhase("analysing")
      // Poll until the background analysis completes, then refresh the case.
      pollUntilDone(
        job_id,
        () => {
          onChanged() // re-fetch graph + docs + gaps in the workspace
          reset()
          onClose()
        },
        (err) => {
          setError(err)
          setPhase("error")
        },
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
      setPhase("error")
    }
  }

  const busy = phase === "uploading" || phase === "analysing"

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) {
          reset()
          onClose()
        }
      }}
      title="Upload document"
    >
      {/* Drop zone */}
      <div
        onClick={() => !busy && inputRef.current?.click()}
        className={`flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-6 text-center transition-colors hover:border-primary ${
          busy ? "pointer-events-none opacity-60" : ""
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.eml,.csv"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <>
            <span className={`mb-2 inline-flex h-10 w-10 items-center justify-center rounded-md text-xs font-semibold ${FILE_TYPE_COLOR[getFileType(file.name)] ?? "bg-subtle text-navy"}`}>
              {FILE_TYPE_LABEL[getFileType(file.name)] ?? getFileType(file.name).toUpperCase()}
            </span>
            <p className="font-semibold text-navy">{file.name}</p>
            <p className="text-xs text-muted">{formatBytes(file.size)}</p>
          </>
        ) : (
          <>
            <p className="font-semibold text-navy">Click to choose a document</p>
            <p className="mt-1 text-xs text-muted">
              Supported: PDF, Word (.docx), Email (.eml), CSV · Text extraction
              only — scanned/OCR documents are not supported.
            </p>
          </>
        )}
      </div>

      {phase === "analysing" && (
        <p className="mt-4 flex items-center gap-2 text-sm text-info">
          <span className="inline-block h-3 w-3 animate-spin-slow rounded-full border-2 border-info border-t-transparent" />
          Extracting text and mapping evidence to propositions with Claude…
        </p>
      )}
      {phase === "uploading" && (
        <p className="mt-4 text-sm text-muted">Uploading…</p>
      )}
      {phase === "error" && <p className="mt-4 text-sm text-error">{error}</p>}

      <div className="mt-6 flex justify-end gap-3 border-t border-border pt-5">
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            reset()
            onClose()
          }}
        >
          Cancel
        </Button>
        <Button onClick={handleUpload} disabled={!file || busy}>
          {busy ? "Processing…" : "Upload & analyse"}
        </Button>
      </div>
    </Modal>
  )
}
