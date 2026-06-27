/*
  Argument graph view with dedicated edit mode (DESIGN_SYSTEM.md §6).
  Renders Elements with nested Propositions; clicking a proposition opens a
  side panel of its evidence. In edit mode, all nodes become editable inline.

  Backend (read):
    GET /api/cases/{id}/graph                  -> elements + propositions
    GET /api/propositions/{id}/evidence        -> evidence for the side panel

  Backend (write, edit mode only):
    POST /api/cases/{id}/elements              -> create element
    PUT /api/elements/{id}                     -> update element
    DELETE /api/elements/{id}                  -> delete element
    POST /api/elements/{id}/propositions       -> create proposition
    PUT /api/propositions/{id}                 -> update proposition
    DELETE /api/propositions/{id}              -> delete proposition
    POST /api/propositions/{id}/evidence       -> add evidence
    PUT /api/evidence/{id}                     -> update evidence
    DELETE /api/evidence/{id}                  -> delete evidence
*/
import { useEffect, useState, type FormEvent } from "react"
import { Edit, Trash2, Plus } from "lucide-react"
import { api } from "../api/client"
import type { DocumentItem, Element, ElementStatus, Evidence, EvidenceClassification, Proposition } from "../types"
import {
  Button,
  ClassificationTag,
  Spinner,
  StatusBadge,
} from "../components/ui"

const STATUS_BORDER: Record<string, string> = {
  Established: "border-l-success",
  Contested: "border-l-warning",
  Gap: "border-l-muted",
}

interface ArgumentGraphProps {
  elements: Element[]
  editMode?: boolean
  onChanged?: () => void
  documents?: DocumentItem[]
  caseId?: string
}

export default function ArgumentGraph({
  elements,
  editMode = false,
  onChanged,
  documents = [],
  caseId,
}: ArgumentGraphProps) {
  const [selected, setSelected] = useState<Proposition | null>(null)
  const [loadingOp, setLoadingOp] = useState<string | null>(null)

  if (elements.length === 0) {
    return (
      <p className="py-12 text-center text-muted">
        No argument graph yet. Select articles to build one.
      </p>
    )
  }

  async function handleDeleteElement(el: Element) {
    if (!window.confirm(`Delete element "${el.title}" and all its propositions?`)) return
    try {
      setLoadingOp(`delete-element-${el.id}`)
      await api.deleteElement(el.id)
      onChanged?.()
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : "Unknown error"}`)
    } finally {
      setLoadingOp(null)
    }
  }

  async function handleDeleteProposition(prop: Proposition) {
    if (!window.confirm(`Delete proposition "${prop.title}"?`)) return
    try {
      setLoadingOp(`delete-proposition-${prop.id}`)
      await api.deleteProposition(prop.id)
      if (selected?.id === prop.id) setSelected(null)
      onChanged?.()
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : "Unknown error"}`)
    } finally {
      setLoadingOp(null)
    }
  }

  return (
    <div className="flex gap-6">
      {/* Graph column */}
      <div className="flex-1 space-y-6">
        {elements.map((el) => (
          <ElementCard
            key={el.id}
            element={el}
            editMode={editMode}
            selected={selected}
            onSelectProp={setSelected}
            onDeleteElement={() => handleDeleteElement(el)}
            onDeleteProposition={(prop) => handleDeleteProposition(prop)}
            onChanged={onChanged}
            caseId={caseId}
            loadingOp={loadingOp}
            setLoadingOp={setLoadingOp}
          />
        ))}

        {/* Add element button (edit mode only) */}
        {editMode && caseId && (
          <div className="rounded-lg border-2 border-dashed border-border bg-surface/50 p-4">
            <AddElementForm caseId={caseId} onAdded={onChanged} setLoadingOp={setLoadingOp} />
          </div>
        )}
      </div>

      {/* Evidence side panel */}
      <div className="w-[340px] shrink-0">
        <div className="sticky top-6">
          {selected ? (
            <EvidencePanel
              key={selected.id}
              proposition={selected}
              editMode={editMode}
              documents={documents}
              onChanged={onChanged}
              loadingOp={loadingOp}
              setLoadingOp={setLoadingOp}
            />
          ) : (
            <div className="rounded-lg border border-border bg-subtle p-6 text-center text-sm text-muted">
              Select a proposition to view its evidence.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface ElementCardProps {
  element: Element
  editMode: boolean
  selected: Proposition | null
  onSelectProp: (prop: Proposition) => void
  onDeleteElement: () => void
  onDeleteProposition: (prop: Proposition) => void
  onChanged?: () => void
  caseId?: string
  loadingOp: string | null
  setLoadingOp: (op: string | null) => void
}

function ElementCard({
  element,
  editMode,
  selected,
  onSelectProp,
  onDeleteElement,
  onDeleteProposition,
  onChanged,
  caseId,
  loadingOp,
  setLoadingOp,
}: ElementCardProps) {
  const [editingEl, setEditingEl] = useState(false)
  const [editTitle, setEditTitle] = useState(element.title)
  const [editSource, setEditSource] = useState(element.source)
  const [editStatus, setEditStatus] = useState<ElementStatus>(element.status)

  async function saveElement() {
    try {
      setLoadingOp(`update-element-${element.id}`)
      await api.updateElement(element.id, {
        title: editTitle,
        source: editSource,
        status: editStatus,
      })
      setEditingEl(false)
      onChanged?.()
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : "Unknown error"}`)
    } finally {
      setLoadingOp(null)
    }
  }

  return (
    <div className="rounded-lg border-2 border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1">
          <span className="mt-0.5 inline-flex items-center rounded-md bg-navy px-2 py-0.5 text-xs font-semibold text-white">
            {element.label}
          </span>
          {editingEl ? (
            <div className="flex-1 space-y-3">
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full rounded-md border border-border px-3 py-2 text-sm text-navy outline-none focus:border-primary"
                placeholder="Element title"
              />
              <input
                type="text"
                value={editSource}
                onChange={(e) => setEditSource(e.target.value)}
                className="w-full rounded-md border border-border px-3 py-2 text-sm text-navy outline-none focus:border-primary"
                placeholder="Source (e.g., Art. 82 GDPR)"
              />
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as ElementStatus)}
                className="w-full rounded-md border border-border px-3 py-2 text-sm text-navy outline-none focus:border-primary"
              >
                <option>Established</option>
                <option>Contested</option>
                <option>Gap</option>
              </select>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  className="!py-1 text-xs"
                  onClick={saveElement}
                  disabled={loadingOp === `update-element-${element.id}`}
                >
                  {loadingOp === `update-element-${element.id}` ? "Saving…" : "Save"}
                </Button>
                <Button
                  variant="secondary"
                  className="!py-1 text-xs"
                  onClick={() => {
                    setEditingEl(false)
                    setEditTitle(element.title)
                    setEditSource(element.source)
                    setEditStatus(element.status)
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <h3 className="text-xl text-navy leading-snug">{element.title}</h3>
              <p className="mt-0.5 text-xs text-muted">{element.source}</p>
            </div>
          )}
        </div>
        {!editingEl && (
          <div className="flex items-center gap-2">
            <StatusBadge status={element.status} />
            {editMode && (
              <div className="flex gap-1">
                <button
                  onClick={() => setEditingEl(true)}
                  className="text-muted hover:text-navy transition-colors p-1"
                  title="Edit"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={onDeleteElement}
                  className="text-muted hover:text-error transition-colors p-1"
                  title="Delete"
                  disabled={loadingOp === `delete-element-${element.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Propositions nested under the element */}
      <div className="mt-4 space-y-2 pl-4">
        {element.propositions.map((p) => {
          const isSel = selected?.id === p.id
          const isDeleting = loadingOp === `delete-proposition-${p.id}`
          return (
            <div key={p.id}>
              <button
                onClick={() => onSelectProp(p)}
                className={`w-full rounded-md border-l-[3px] bg-[#f9f9f9] px-4 py-3 text-left transition-all ${
                  STATUS_BORDER[p.status]
                } ${isSel ? "ring-2 ring-primary" : "hover:bg-subtle"}`}
                disabled={isDeleting}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted">{p.label}</span>
                    <span className="text-sm text-navy">{p.title}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-muted">
                      {p.evidence_count} ev
                      {p.gap_count > 0 && <span className="ml-1 text-error">· {p.gap_count} gap</span>}
                    </span>
                    <StatusBadge status={p.status} />
                  </div>
                </div>
              </button>
              {editMode && (
                <div className="mt-1 ml-4 flex gap-1">
                  <PropositionEditButton
                    proposition={p}
                    onChanged={onChanged}
                    setLoadingOp={setLoadingOp}
                    loadingOp={loadingOp}
                  />
                  <button
                    onClick={() => onDeleteProposition(p)}
                    className="text-xs text-muted hover:text-error transition-colors px-2 py-1 flex items-center gap-1"
                    title="Delete"
                    disabled={isDeleting}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {/* Add proposition button (edit mode only) */}
        {editMode && caseId && (
          <div className="mt-2">
            <AddPropositionForm
              elementId={element.id}
              elementLabel={element.label}
              nextPropositionIndex={element.propositions.length}
              onAdded={onChanged}
              setLoadingOp={setLoadingOp}
            />
          </div>
        )}
      </div>
    </div>
  )
}

interface PropositionEditButtonProps {
  proposition: Proposition
  onChanged?: () => void
  setLoadingOp: (op: string | null) => void
  loadingOp: string | null
}

function PropositionEditButton({
  proposition,
  onChanged,
  setLoadingOp,
  loadingOp,
}: PropositionEditButtonProps) {
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(proposition.title)
  const [editStatus, setEditStatus] = useState<typeof proposition.status>(proposition.status)

  async function save() {
    try {
      setLoadingOp(`update-proposition-${proposition.id}`)
      await api.updateProposition(proposition.id, {
        title: editTitle,
        status: editStatus,
      })
      setEditing(false)
      onChanged?.()
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : "Unknown error"}`)
    } finally {
      setLoadingOp(null)
    }
  }

  if (editing) {
    return (
      <div className="space-y-1 text-xs">
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="w-full rounded-md border border-border px-2 py-1 text-navy outline-none focus:border-primary"
          placeholder="Proposition title"
        />
        <select
          value={editStatus}
          onChange={(e) => setEditStatus(e.target.value as typeof proposition.status)}
          className="w-full rounded-md border border-border px-2 py-1 text-navy outline-none focus:border-primary"
        >
          <option>Established</option>
          <option>Contested</option>
          <option>Gap</option>
        </select>
        <div className="flex gap-1">
          <button
            onClick={save}
            className="rounded-md bg-primary px-2 py-1 text-white hover:bg-primary/90 disabled:opacity-50"
            disabled={loadingOp === `update-proposition-${proposition.id}`}
          >
            {loadingOp === `update-proposition-${proposition.id}` ? "…" : "Save"}
          </button>
          <button
            onClick={() => {
              setEditing(false)
              setEditTitle(proposition.title)
              setEditStatus(proposition.status)
            }}
            className="rounded-md bg-muted px-2 py-1 text-white hover:bg-muted/90"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-xs text-muted hover:text-navy transition-colors px-2 py-1 flex items-center gap-1"
      title="Edit"
    >
      <Edit className="w-3 h-3" />
      Edit
    </button>
  )
}

interface AddPropositionFormProps {
  elementId: string
  elementLabel: string
  nextPropositionIndex: number
  onAdded?: () => void
  setLoadingOp: (op: string | null) => void
}

function AddPropositionForm({
  elementId,
  elementLabel,
  nextPropositionIndex,
  onAdded,
  setLoadingOp,
}: AddPropositionFormProps) {
  const [showing, setShowing] = useState(false)
  const [title, setTitle] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    try {
      setSaving(true)
      setLoadingOp(`add-proposition-${elementId}`)
      const nextIndex = nextPropositionIndex + 1
      const label = `${elementLabel}-P${nextIndex}`
      await api.createProposition(elementId, { label, title })
      setTitle("")
      setShowing(false)
      onAdded?.()
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : "Unknown error"}`)
    } finally {
      setSaving(false)
      setLoadingOp(null)
    }
  }

  if (!showing) {
    return (
      <button
        onClick={() => setShowing(true)}
        className="text-xs text-primary hover:underline flex items-center gap-1"
      >
        <Plus className="w-3 h-3" />
        Add proposition
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-md bg-subtle p-2">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Proposition title"
        className="w-full rounded-md border border-border px-2 py-1 text-sm text-navy outline-none focus:border-primary"
        autoFocus
      />
      <div className="flex gap-1">
        <button
          type="submit"
          disabled={!title.trim() || saving}
          className="rounded-md bg-primary px-2 py-1 text-xs text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "…" : "Add"}
        </button>
        <button
          type="button"
          onClick={() => {
            setShowing(false)
            setTitle("")
          }}
          className="rounded-md bg-muted px-2 py-1 text-xs text-white hover:bg-muted/90"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

interface AddElementFormProps {
  caseId: string
  onAdded?: () => void
  setLoadingOp: (op: string | null) => void
}

function AddElementForm({ caseId, onAdded, setLoadingOp }: AddElementFormProps) {
  const [showing, setShowing] = useState(false)
  const [label, setLabel] = useState("")
  const [title, setTitle] = useState("")
  const [source, setSource] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !label.trim()) return
    try {
      setSaving(true)
      setLoadingOp(`add-element-${caseId}`)
      await api.createElement(caseId, { label, title, source })
      setLabel("")
      setTitle("")
      setSource("")
      setShowing(false)
      onAdded?.()
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : "Unknown error"}`)
    } finally {
      setSaving(false)
      setLoadingOp(null)
    }
  }

  if (!showing) {
    return (
      <button
        onClick={() => setShowing(true)}
        className="text-sm text-primary hover:underline font-semibold flex items-center gap-1"
      >
        <Plus className="w-4 h-4" />
        Add element
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value.toUpperCase())}
        placeholder="Label (e.g., E4)"
        className="rounded-md border border-border px-3 py-2 text-sm text-navy outline-none focus:border-primary"
        autoFocus
      />
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Element title"
        className="w-full rounded-md border border-border px-3 py-2 text-sm text-navy outline-none focus:border-primary"
      />
      <input
        type="text"
        value={source}
        onChange={(e) => setSource(e.target.value)}
        placeholder="Source (e.g., Art. 82 GDPR)"
        className="w-full rounded-md border border-border px-3 py-2 text-sm text-navy outline-none focus:border-primary"
      />
      <div className="flex gap-2">
        <Button
          variant="primary"
          className="!py-2 text-xs"
          type="submit"
          disabled={!title.trim() || !label.trim() || saving}
        >
          {saving ? "Adding…" : "Add Element"}
        </Button>
        <Button
          variant="secondary"
          className="!py-2 text-xs"
          type="button"
          onClick={() => {
            setShowing(false)
            setLabel("")
            setTitle("")
            setSource("")
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}

interface EvidencePanelProps {
  proposition: Proposition
  editMode: boolean
  documents: DocumentItem[]
  onChanged?: () => void
  loadingOp: string | null
  setLoadingOp: (op: string | null) => void
}

function EvidencePanel({
  proposition,
  editMode,
  documents,
  onChanged,
  loadingOp,
  setLoadingOp,
}: EvidencePanelProps) {
  const [evidence, setEvidence] = useState<Evidence[] | null>(null)
  const [addingEvidence, setAddingEvidence] = useState(false)

  // Fetch evidence for this proposition.
  useEffect(() => {
    let active = true
    api.getEvidence(proposition.id).then((ev) => {
      if (active) {
        // Enrich evidence with document filenames from documents array
        const docNameMap = Object.fromEntries(
          documents.map((d) => [d.id, d.filename])
        )
        const enrichedEv = ev.map((e) => ({
          ...e,
          document_filename: docNameMap[e.document_id] || e.document_filename || "Unknown document",
        }))
        setEvidence(enrichedEv)
      }
    })
    return () => {
      active = false
    }
  }, [proposition.id, documents])

  async function refetchEvidence() {
    try {
      const ev = await api.getEvidence(proposition.id)
      setEvidence(ev)
    } catch (e) {
      console.error("Error refetching evidence:", e)
    }
  }

  async function handleDeleteEvidence(evidenceId: string) {
    if (!window.confirm("Delete this evidence item?")) return
    try {
      setLoadingOp(`delete-evidence-${evidenceId}`)
      await api.deleteEvidence(evidenceId)
      await refetchEvidence()
      onChanged?.()
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : "Unknown error"}`)
    } finally {
      setLoadingOp(null)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold text-muted">{proposition.label}</span>
        <StatusBadge status={proposition.status} />
      </div>
      <p className="mb-4 text-sm text-navy">{proposition.title}</p>

      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Evidence</h4>

      {evidence === null ? (
        <Spinner />
      ) : evidence.length === 0 ? (
        <p className="rounded-md border border-[#fecaca] border-l-4 border-l-error bg-[#fef2f2] p-3 text-xs text-navy">
          No evidence mapped to this proposition yet — this is a gap.
        </p>
      ) : (
        <div className="space-y-3">
          {evidence.map((ev) => (
            <div key={ev.id}>
              <div
                className={`rounded-md border border-border bg-surface p-3 ${
                  ev.classification === "Supportive"
                    ? "border-l-[3px] border-l-success"
                    : ev.classification === "Adverse"
                      ? "border-l-[3px] border-l-error"
                      : "border-l-[3px] border-l-muted"
                }`}
              >
                <p className="mb-2 text-sm italic text-navy">"{ev.excerpt}"</p>
                <div className="flex items-center justify-between text-xs text-muted">
                  <ClassificationTag value={ev.classification} />
                  <span>{ev.source_ref}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
                  <span>{ev.document_filename ?? "Document"}</span>
                  <span className="rounded bg-subtle px-1.5 py-0.5 uppercase">{ev.added_by}</span>
                </div>
              </div>
              {editMode && (
                <div className="mt-1 ml-0 flex gap-1 text-xs">
                  <EvidenceEditButton
                    evidence={ev}
                    onChanged={refetchEvidence}
                    setLoadingOp={setLoadingOp}
                    loadingOp={loadingOp}
                  />
                  <button
                    onClick={() => handleDeleteEvidence(ev.id)}
                    className="text-muted hover:text-error transition-colors px-2 py-1 flex items-center gap-1"
                    disabled={loadingOp === `delete-evidence-${ev.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                    {loadingOp === `delete-evidence-${ev.id}` ? "Deleting…" : "Delete"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Manual evidence entry / add form */}
      {editMode ? (
        <>
          <div className="mt-4 border-t border-border pt-4">
            {addingEvidence ? (
              <ManualEvidenceForm
                propositionId={proposition.id}
                documents={documents}
                onAdded={async () => {
                  await refetchEvidence()
                  setAddingEvidence(false)
                  onChanged?.()
                }}
                onCancel={() => setAddingEvidence(false)}
                setLoadingOp={setLoadingOp}
              />
            ) : (
              <button
                onClick={() => setAddingEvidence(true)}
                className="w-full rounded-md border border-border bg-subtle px-3 py-2 text-xs font-semibold text-navy hover:bg-border/50 transition-colors flex items-center justify-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Add evidence manually
              </button>
            )}
          </div>
        </>
      ) : (
        <Button
          variant="secondary"
          className="mt-4 w-full !py-2 text-xs flex items-center justify-center gap-1"
          onClick={() =>
            alert(
              "Manual evidence entry → POST /api/propositions/" +
                proposition.id +
                "/evidence (added_by='human'). Toggle Edit mode to add evidence.",
            )
          }
        >
          <Plus className="w-3 h-3" />
          Add evidence manually
        </Button>
      )}
    </div>
  )
}

interface EvidenceEditButtonProps {
  evidence: Evidence
  onChanged?: () => void
  setLoadingOp: (op: string | null) => void
  loadingOp: string | null
}

function EvidenceEditButton({
  evidence,
  onChanged,
  setLoadingOp,
  loadingOp,
}: EvidenceEditButtonProps) {
  const [editing, setEditing] = useState(false)
  const [editExcerpt, setEditExcerpt] = useState(evidence.excerpt)
  const [editClassification, setEditClassification] = useState<EvidenceClassification>(evidence.classification)
  const [editSourceRef, setEditSourceRef] = useState(evidence.source_ref)

  async function save() {
    try {
      setLoadingOp(`update-evidence-${evidence.id}`)
      await api.updateEvidence(evidence.id, {
        excerpt: editExcerpt,
        classification: editClassification,
        source_ref: editSourceRef,
      })
      setEditing(false)
      onChanged?.()
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : "Unknown error"}`)
    } finally {
      setLoadingOp(null)
    }
  }

  if (editing) {
    return (
      <div className="space-y-1 text-xs w-full">
        <textarea
          value={editExcerpt}
          onChange={(e) => setEditExcerpt(e.target.value)}
          className="w-full rounded-md border border-border px-2 py-1 text-navy outline-none focus:border-primary"
          rows={2}
          placeholder="Evidence excerpt"
        />
        <select
          value={editClassification}
          onChange={(e) => setEditClassification(e.target.value as EvidenceClassification)}
          className="w-full rounded-md border border-border px-2 py-1 text-navy outline-none focus:border-primary"
        >
          <option>Supportive</option>
          <option>Adverse</option>
          <option>Neutral</option>
        </select>
        <input
          type="text"
          value={editSourceRef}
          onChange={(e) => setEditSourceRef(e.target.value)}
          className="w-full rounded-md border border-border px-2 py-1 text-navy outline-none focus:border-primary"
          placeholder="Source ref (e.g., §4.2, p.12)"
        />
        <div className="flex gap-1">
          <button
            onClick={save}
            className="rounded-md bg-primary px-2 py-1 text-white hover:bg-primary/90 disabled:opacity-50"
            disabled={loadingOp === `update-evidence-${evidence.id}`}
          >
            {loadingOp === `update-evidence-${evidence.id}` ? "…" : "Save"}
          </button>
          <button
            onClick={() => {
              setEditing(false)
              setEditExcerpt(evidence.excerpt)
              setEditClassification(evidence.classification)
              setEditSourceRef(evidence.source_ref)
            }}
            className="rounded-md bg-muted px-2 py-1 text-white hover:bg-muted/90"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-muted hover:text-navy transition-colors px-2 py-1 flex items-center gap-1"
      title="Edit"
    >
      <Edit className="w-3 h-3" />
      Edit
    </button>
  )
}

interface ManualEvidenceFormProps {
  propositionId: string
  documents: DocumentItem[]
  onAdded: () => void
  onCancel: () => void
  setLoadingOp: (op: string | null) => void
}

function ManualEvidenceForm({
  propositionId,
  documents,
  onAdded,
  onCancel,
  setLoadingOp,
}: ManualEvidenceFormProps) {
  const [excerpt, setExcerpt] = useState("")
  const [classification, setClassification] = useState<EvidenceClassification>("Supportive")
  const [sourceRef, setSourceRef] = useState("")
  const [documentId, setDocumentId] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!excerpt.trim() || !documentId) return
    try {
      setSaving(true)
      setLoadingOp(`add-evidence-${propositionId}`)
      await api.addEvidence(propositionId, {
        document_id: documentId,
        excerpt,
        classification,
        source_ref: sourceRef,
      })
      onAdded()
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : "Unknown error"}`)
    } finally {
      setSaving(false)
      setLoadingOp(null)
    }
  }

  const inputCls = "w-full rounded-md border border-border px-3 py-2 text-sm text-navy outline-none focus:border-primary"

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-muted">Excerpt</span>
        <textarea
          required
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          className={inputCls}
          rows={2}
          placeholder="Copy relevant text from the document"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-muted">Classification</span>
        <select
          value={classification}
          onChange={(e) => setClassification(e.target.value as EvidenceClassification)}
          className={inputCls}
        >
          <option>Supportive</option>
          <option>Adverse</option>
          <option>Neutral</option>
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-muted">Source ref</span>
        <input
          type="text"
          value={sourceRef}
          onChange={(e) => setSourceRef(e.target.value)}
          className={inputCls}
          placeholder="e.g., §4.2, p.12"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-muted">Document</span>
        <select
          required
          value={documentId}
          onChange={(e) => setDocumentId(e.target.value)}
          className={inputCls}
        >
          <option value="">Select document…</option>
          {documents.map((doc) => (
            <option key={doc.id} value={doc.id}>
              {doc.filename}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!excerpt.trim() || !documentId || saving}
          className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Add Evidence"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md bg-muted px-3 py-2 text-xs font-semibold text-white hover:bg-muted/90"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
