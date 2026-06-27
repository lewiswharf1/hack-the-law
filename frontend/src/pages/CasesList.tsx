/*
  Cases list (CLAUDE.md §15.3). Loads all cases on mount and lets the user open
  one or start a new case.

  Backend: GET /api/cases -> CaseSummary[]; POST /api/cases creates a Draft case
  which then flows into the article-selection / graph-build step (CaseSetup).
*/
import { useEffect, useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { api } from "../api/client"
import type { CaseSummary, NewCaseDetails } from "../types"
import { Button, Card, Modal, ReadinessBar } from "../components/ui"
import { Trash2 } from "lucide-react"

const STATUS_DOT: Record<string, string> = {
  Draft: "bg-muted",
  "In Progress": "bg-info",
  Filed: "bg-success",
  Closed: "bg-navy",
}

export default function CasesList() {
  const navigate = useNavigate()
  const [cases, setCases] = useState<CaseSummary[] | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Load cases on mount — GET /api/cases
  useEffect(() => {
    api.getCases().then(setCases)
  }, [])

  async function handleCreate(details: NewCaseDetails) {
    const created = await api.createCase(details)
    setShowNew(false)
    // New case has no graph yet → go straight to article selection / build.
    navigate(`/cases/${created.id}/setup`)
  }

  async function handleDelete(caseId: string) {
    setDeleting(true)
    try {
      await api.deleteCase(caseId)
      setCases((prev) => prev ? prev.filter((c) => c.id !== caseId) : null)
      setDeleteConfirm(null)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="min-h-full bg-subtle">
      <div className="mx-auto max-w-[1200px] px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-4xl text-navy">Cases</h1>
            <p className="mt-1 text-sm text-muted">
              {cases ? `${cases.length} matters` : "Loading…"}
            </p>
          </div>
          <Button onClick={() => setShowNew(true)}>+ New case</Button>
        </div>

        {!cases ? (
          <p className="text-muted">Loading cases…</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {cases.map((c) => (
              <Card
                key={c.id}
                hover
                onClick={() =>
                  navigate(c.has_graph ? `/cases/${c.id}` : `/cases/${c.id}/setup`)
                }
                className="relative"
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeleteConfirm(c.id)
                  }}
                  className="absolute right-4 top-4 p-1 text-muted hover:text-error transition-colors"
                  title="Delete case"
                >
                  <Trash2 size={16} />
                </button>

                <div className="mb-3 flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${STATUS_DOT[c.status] ?? "bg-muted"}`} />
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                    {c.status}
                  </span>
                </div>
                <h3 className="text-xl text-navy leading-snug">{c.short_name}</h3>
                <p className="mt-1 text-sm text-muted">{c.client}</p>

                <dl className="mt-4 space-y-1 text-xs text-muted">
                  <div className="flex justify-between">
                    <dt>Court</dt>
                    <dd className="text-navy text-right">{c.court || "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Claim</dt>
                    <dd className="text-navy text-right">{c.claim_type}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Reference</dt>
                    <dd className="text-navy text-right">{c.reference || "—"}</dd>
                  </div>
                </dl>

                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-muted">Readiness</span>
                    <span className="font-semibold text-navy">{c.readiness}%</span>
                  </div>
                  <ReadinessBar value={c.readiness} />
                </div>
              </Card>
            ))}
          </div>
        )}

        <NewCaseModal
          open={showNew}
          onClose={() => setShowNew(false)}
          onCreate={handleCreate}
        />

        <DeleteConfirmModal
          open={!!deleteConfirm}
          caseName={cases?.find((c) => c.id === deleteConfirm)?.short_name}
          onClose={() => setDeleteConfirm(null)}
          onConfirm={() => deleteConfirm ? handleDelete(deleteConfirm) : Promise.resolve()}
          loading={deleting}
        />
      </div>
    </div>
  )
}

function NewCaseModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  onCreate: (d: NewCaseDetails) => Promise<void>
}) {
  const [form, setForm] = useState<NewCaseDetails>({
    name: "",
    client: "",
    court: "",
    reference: "",
  })
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await onCreate(form)
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    "w-full rounded-md border border-border px-4 py-3 text-base outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(124,58,237,0.1)]"

  return (
    <Modal open={open} onClose={onClose} title="New case">
      <form onSubmit={submit} className="space-y-5">
        <Field label="Case name">
          <input
            required
            className={inputCls}
            placeholder="Müller v. DataCorp Analytics GmbH"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="Client">
          <input
            className={inputCls}
            placeholder="Hannah Müller"
            value={form.client}
            onChange={(e) => setForm({ ...form, client: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Court">
            <input
              className={inputCls}
              placeholder="Landgericht Berlin"
              value={form.court}
              onChange={(e) => setForm({ ...form, court: e.target.value })}
            />
          </Field>
          <Field label="Reference">
            <input
              className={inputCls}
              placeholder="LG-BLN-2026-…"
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-3 border-t border-border pt-5">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !form.name}>
            {saving ? "Creating…" : "Create & set up case"}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-navy">{label}</span>
      {children}
    </label>
  )
}

function DeleteConfirmModal({
  open,
  caseName,
  onClose,
  onConfirm,
  loading,
}: {
  open: boolean
  caseName?: string
  onClose: () => void
  onConfirm: () => Promise<void>
  loading: boolean
}) {
  async function handleConfirm() {
    await onConfirm()
  }

  return (
    <Modal open={open} onClose={onClose} title="Delete case">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Are you sure you want to delete <span className="font-semibold text-navy">"{caseName}"</span>? This action cannot be undone and all documents, evidence, and gaps will be permanently removed.
        </p>
        <div className="flex justify-end gap-3 border-t border-border pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            className="!bg-error hover:!bg-error-dark"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? "Deleting…" : "Delete case"}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
