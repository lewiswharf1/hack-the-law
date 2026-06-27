/*
  Argument graph view (DESIGN_SYSTEM.md §6). Renders Elements with nested
  Propositions; clicking a proposition opens a side panel of its evidence.

  Backend:
    GET /api/cases/{id}/graph                  -> elements + propositions
    GET /api/propositions/{id}/evidence        -> evidence for the side panel
    POST /api/propositions/{id}/evidence       -> add a human evidence item
*/
import { useEffect, useState } from "react"
import { api } from "../api/client"
import type { Element, Evidence, Proposition } from "../types"
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

export default function ArgumentGraph({ elements }: { elements: Element[] }) {
  const [selected, setSelected] = useState<Proposition | null>(null)

  if (elements.length === 0) {
    return (
      <p className="py-12 text-center text-muted">
        No argument graph yet. Select articles to build one.
      </p>
    )
  }

  return (
    <div className="flex gap-6">
      {/* Graph column */}
      <div className="flex-1 space-y-6">
        {elements.map((el) => (
          <div key={el.id} className="rounded-lg border-2 border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex items-center rounded-md bg-navy px-2 py-0.5 text-xs font-semibold text-white">
                  {el.label}
                </span>
                <div>
                  <h3 className="text-xl text-navy leading-snug">{el.title}</h3>
                  <p className="mt-0.5 text-xs text-muted">{el.source}</p>
                </div>
              </div>
              <StatusBadge status={el.status} />
            </div>

            {/* Propositions nested under the element */}
            <div className="mt-4 space-y-2 pl-4">
              {el.propositions.map((p) => {
                const isSel = selected?.id === p.id
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelected(p)}
                    className={`w-full rounded-md border-l-[3px] bg-[#f9f9f9] px-4 py-3 text-left transition-all ${
                      STATUS_BORDER[p.status]
                    } ${isSel ? "ring-2 ring-primary" : "hover:bg-subtle"}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-muted">
                          {p.label}
                        </span>
                        <span className="text-sm text-navy">{p.title}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-xs text-muted">
                          {p.evidence_count} ev
                          {p.gap_count > 0 && (
                            <span className="ml-1 text-error">· {p.gap_count} gap</span>
                          )}
                        </span>
                        <StatusBadge status={p.status} />
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Evidence side panel */}
      <div className="w-[340px] shrink-0">
        <div className="sticky top-6">
          {selected ? (
            // key remount so each selection starts with a fresh loading state
            <EvidencePanel key={selected.id} proposition={selected} />
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

function EvidencePanel({ proposition }: { proposition: Proposition }) {
  const [evidence, setEvidence] = useState<Evidence[] | null>(null)

  // Fetch evidence for this proposition. The component is keyed on the
  // proposition id by its parent, so it remounts (and re-runs this) on selection.
  useEffect(() => {
    let active = true
    api.getEvidence(proposition.id).then((ev) => {
      if (active) setEvidence(ev)
    })
    return () => {
      active = false
    }
  }, [proposition.id])

  return (
    <div className="rounded-lg border border-border bg-surface p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold text-muted">{proposition.label}</span>
        <StatusBadge status={proposition.status} />
      </div>
      <p className="mb-4 text-sm text-navy">{proposition.title}</p>

      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
        Evidence
      </h4>

      {evidence === null ? (
        <Spinner />
      ) : evidence.length === 0 ? (
        <p className="rounded-md border border-[#fecaca] border-l-4 border-l-error bg-[#fef2f2] p-3 text-xs text-navy">
          No evidence mapped to this proposition yet — this is a gap.
        </p>
      ) : (
        <div className="space-y-3">
          {evidence.map((ev) => (
            <div
              key={ev.id}
              className={`rounded-md border border-border bg-surface p-3 ${
                ev.classification === "Supportive"
                  ? "border-l-[3px] border-l-success"
                  : ev.classification === "Adverse"
                    ? "border-l-[3px] border-l-error"
                    : "border-l-[3px] border-l-muted"
              }`}
            >
              <p className="mb-2 text-sm italic text-navy">“{ev.excerpt}”</p>
              <div className="flex items-center justify-between text-xs text-muted">
                <ClassificationTag value={ev.classification} />
                <span>{ev.source_ref}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
                <span>{ev.document_filename ?? "Document"}</span>
                <span className="rounded bg-subtle px-1.5 py-0.5 uppercase">
                  {ev.added_by}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Human evidence entry is a documented endpoint (POST .../evidence).
          Wired as a placeholder action for the prototype. */}
      <Button
        variant="secondary"
        className="mt-4 w-full !py-2 text-xs"
        onClick={() =>
          alert(
            "Manual evidence entry → POST /api/propositions/" +
              proposition.id +
              "/evidence (added_by='human'). Hook up a form here.",
          )
        }
      >
        + Add evidence manually
      </Button>
    </div>
  )
}
