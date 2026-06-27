/*
  Gaps panel (CLAUDE.md §7 Gaps). Lists AI- and human-flagged gaps, lets the
  user resolve them or change severity.

  Backend:
    GET  /api/cases/{id}/gaps
    POST /api/cases/{id}/gaps        (added_by='human')
    PUT  /api/gaps/{id}              (resolve / override severity)
*/
import { useState, type FormEvent } from "react"
import { api } from "../api/client"
import type { Gap, GapSeverity } from "../types"
import { Button, Card, Modal, SeverityBadge } from "../components/ui"

export default function GapsPanel({
  gaps,
  caseId,
  onChanged,
  editMode = false,
}: {
  gaps: Gap[]
  caseId: string
  onChanged: () => void
  editMode?: boolean
}) {
  const [showNew, setShowNew] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const open = gaps.filter((g) => g.status === "open")
  const resolved = gaps.filter((g) => g.status === "resolved")

  async function resolve(gap: Gap) {
    await api.updateGap(gap.id, { status: "resolved" })
    onChanged()
  }
  async function changeSeverity(gap: Gap, severity: GapSeverity) {
    await api.updateGap(gap.id, { severity })
    onChanged()
  }
  async function deleteGap(gap: Gap) {
    if (!window.confirm(`Delete gap "${gap.title}"?`)) return
    try {
      setDeleting(gap.id)
      await api.deleteGap(gap.id)
      onChanged()
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : "Unknown error"}`)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-xl text-navy">Evidence gaps</h3>
          <p className="text-sm text-muted">
            {open.length} open · {resolved.length} resolved
          </p>
        </div>
        <Button onClick={() => setShowNew(true)}>+ Flag gap</Button>
      </div>

      <div className="space-y-3">
        {open.map((g) => (
          <Card key={g.id} className="!p-4 border-l-4 border-l-error">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-navy">{g.title}</p>
                  <span className="rounded bg-subtle px-1.5 py-0.5 text-[11px] uppercase text-muted">
                    {g.source}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted">{g.why}</p>
                <p className="mt-2 text-sm text-navy">
                  <span className="font-semibold">Action: </span>
                  {g.action}
                </p>
              </div>
              <SeverityBadge severity={g.severity} />
            </div>

            <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
              {/* Severity override (PUT /gaps/{id}) */}
              <select
                value={g.severity}
                onChange={(e) => changeSeverity(g, e.target.value as GapSeverity)}
                className="rounded-md border border-border px-2 py-1 text-xs text-navy outline-none focus:border-primary"
              >
                <option>Critical</option>
                <option>High</option>
                <option>Medium</option>
              </select>
              <Button variant="small" onClick={() => resolve(g)}>
                Mark resolved
              </Button>
              {editMode && (
                <button
                  onClick={() => deleteGap(g)}
                  className="text-xs text-muted hover:text-error transition-colors px-2 py-1 ml-auto"
                  title="Delete"
                  disabled={deleting === g.id}
                >
                  {deleting === g.id ? "…" : "🗑 Delete"}
                </button>
              )}
            </div>
          </Card>
        ))}

        {open.length === 0 && (
          <Card className="text-center text-muted">No open gaps. 🎉</Card>
        )}

        {resolved.length > 0 && (
          <>
            <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Resolved
            </p>
            {resolved.map((g) => (
              <Card key={g.id} className="!p-4 opacity-60">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-navy line-through">{g.title}</p>
                  <SeverityBadge severity={g.severity} />
                </div>
              </Card>
            ))}
          </>
        )}
      </div>

      <NewGapModal
        open={showNew}
        caseId={caseId}
        onClose={() => setShowNew(false)}
        onCreated={() => {
          setShowNew(false)
          onChanged()
        }}
      />
    </div>
  )
}

function NewGapModal({
  open,
  caseId,
  onClose,
  onCreated,
}: {
  open: boolean
  caseId: string
  onClose: () => void
  onCreated: () => void
}) {
  const [title, setTitle] = useState("")
  const [why, setWhy] = useState("")
  const [action, setAction] = useState("")
  const [severity, setSeverity] = useState<GapSeverity>("High")
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.createGap(caseId, { title, why, action, severity })
      setTitle("")
      setWhy("")
      setAction("")
      onCreated()
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    "w-full rounded-md border border-border px-4 py-3 text-base outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(124,58,237,0.1)]"

  return (
    <Modal open={open} onClose={onClose} title="Flag an evidence gap">
      <form onSubmit={submit} className="space-y-5">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-navy">Title</span>
          <input
            required
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="No evidence of quantifiable financial loss"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-navy">Why is this a gap?</span>
          <textarea
            className={inputCls}
            rows={3}
            value={why}
            onChange={(e) => setWhy(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-navy">Recommended action</span>
          <textarea
            className={inputCls}
            rows={2}
            value={action}
            onChange={(e) => setAction(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-navy">Severity</span>
          <select
            className={inputCls}
            value={severity}
            onChange={(e) => setSeverity(e.target.value as GapSeverity)}
          >
            <option>Critical</option>
            <option>High</option>
            <option>Medium</option>
          </select>
        </label>
        <div className="flex justify-end gap-3 border-t border-border pt-5">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !title}>
            {saving ? "Saving…" : "Flag gap"}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
