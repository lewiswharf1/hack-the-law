/*
  Case workspace (CLAUDE.md §15.3). Loads everything the tabs need in one place
  and shares a single `reload()` so any mutation (upload, resolve gap, add
  evidence) refreshes the whole view consistently.

  Backend calls on mount:
    GET /api/cases/{id}          -> case detail incl. elements + propositions
    GET /api/cases/{id}/documents
    GET /api/cases/{id}/gaps
*/
import { useCallback, useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { AlertCircle, Check, Edit } from "lucide-react"
import { api } from "../api/client"
import type { CaseDetail, DocumentItem, Gap } from "../types"
import { Button, ReadinessBar, Spinner } from "../components/ui"
import ArgumentGraph from "../features/ArgumentGraph"
import CaseOverview from "../features/CaseOverview"
import DocumentsInbox from "../features/DocumentsInbox"
import GapsPanel from "../features/GapsPanel"

type Tab = "overview" | "graph" | "documents" | "gaps"
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "graph", label: "Argument Graph" },
  { id: "documents", label: "Documents" },
  { id: "gaps", label: "Gaps" },
]

export default function CaseWorkspace() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>("overview")
  const [editMode, setEditMode] = useState(false)

  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null)
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [gaps, setGaps] = useState<Gap[]>([])
  const [loading, setLoading] = useState(true)

  // Used by child tabs after a mutation (upload, resolve gap, add evidence) to
  // refresh the whole view. Does not toggle the loading state — silent refresh.
  const reload = useCallback(async () => {
    if (!caseId) return
    const [detail, docs, gapList] = await Promise.all([
      api.getCase(caseId),
      api.getDocuments(caseId),
      api.getGaps(caseId),
    ])
    setCaseDetail(detail)
    setDocuments(docs)
    setGaps(gapList)
  }, [caseId])

  // Initial load. setState happens inside the async callback (guarded), so it
  // does not cascade synchronously.
  useEffect(() => {
    if (!caseId) return
    let active = true
    Promise.all([
      api.getCase(caseId),
      api.getDocuments(caseId),
      api.getGaps(caseId),
    ]).then(([detail, docs, gapList]) => {
      if (!active) return
      setCaseDetail(detail)
      setDocuments(docs)
      setGaps(gapList)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [caseId])

  if (loading || !caseDetail) {
    return <Spinner label="Loading case…" />
  }

  return (
    <div>
      {/* Case header */}
      <div className="border-b border-border bg-surface">
        <div className="mx-auto max-w-[1200px] px-6 py-5">
          <button
            onClick={() => navigate("/cases")}
            className="mb-2 text-sm text-muted hover:text-primary cursor-pointer"
          >
            ← Cases
          </button>
          <div className="flex items-end justify-between gap-6">
            <div>
              <h1 className="text-3xl text-navy">{caseDetail.name}</h1>
              <p className="mt-1 text-sm text-muted">
                {caseDetail.client} · {caseDetail.court} · {caseDetail.reference}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <span className="rounded-md bg-info/10 px-2.5 py-1 text-xs font-semibold text-info">
                  {caseDetail.status}
                </span>
                <span className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                  {caseDetail.claim_type}
                </span>
              </div>
            </div>
            <div className="w-48 shrink-0 text-right">
              <p className="text-sm text-muted">Readiness</p>
              <p className="text-2xl font-semibold text-navy">{caseDetail.readiness}%</p>
              <div className="mt-1">
                <ReadinessBar value={caseDetail.readiness} />
              </div>
            </div>
          </div>

          {/* Tabs — DESIGN_SYSTEM.md §4 */}
          <div className="mt-5 flex items-center justify-between gap-1 border-b border-border">
            <div className="flex gap-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTab(t.id)
                    if (t.id !== "graph") setEditMode(false)
                  }}
                  className={`border-b-2 px-4 py-3 text-sm font-semibold transition-colors cursor-pointer ${
                    tab === t.id
                      ? "border-navy text-navy"
                      : "border-transparent text-muted hover:text-navy"
                  }`}
                >
                  {t.label}
                  {t.id === "gaps" && gaps.filter((g) => g.status === "open").length > 0 && (
                    <span className="ml-2 rounded-full bg-error px-1.5 py-0.5 text-[10px] text-white">
                      {gaps.filter((g) => g.status === "open").length}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {tab === "graph" && caseDetail.has_graph && (
              <Button
                variant="secondary"
                className="!py-2 text-xs flex items-center gap-1"
                onClick={() => setEditMode(!editMode)}
              >
                {editMode ? (
                  <>
                    <Check className="w-4 h-4" />
                    Done Editing
                  </>
                ) : (
                  <>
                    <Edit className="w-4 h-4" />
                    Edit Graph
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="mx-auto max-w-[1200px] px-6 py-8">
        {editMode && tab === "graph" && (
          <div className="mb-4 rounded-md border border-warning/50 bg-warning/10 px-4 py-3 text-sm text-warning flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            Edit mode — changes save immediately
          </div>
        )}
        {tab === "overview" && (
          <CaseOverview
            caseDetail={caseDetail}
            documents={documents}
            gaps={gaps}
            onJumpToGaps={() => setTab("gaps")}
          />
        )}
        {tab === "graph" && (
          <ArgumentGraph
            elements={caseDetail.elements}
            editMode={editMode}
            onChanged={reload}
            documents={documents}
            caseId={caseId!}
          />
        )}
        {tab === "documents" && (
          <DocumentsInbox documents={documents} caseId={caseId!} onChanged={reload} />
        )}
        {tab === "gaps" && (
          <GapsPanel
            gaps={gaps}
            caseId={caseId!}
            onChanged={reload}
            editMode={editMode}
          />
        )}
      </div>
    </div>
  )
}
