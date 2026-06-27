/*
  Case overview tab (CLAUDE.md §15.3). Aggregate stats derived from the case
  detail (elements + propositions), documents and gaps already loaded by the
  workspace. No extra fetch needed — the parent passes the data down.
*/
import type { CaseDetail, DocumentItem, Gap } from "../types"
import { Card, ReadinessBar, SeverityBadge } from "../components/ui"

export default function CaseOverview({
  caseDetail,
  documents,
  gaps,
  onJumpToGaps,
}: {
  caseDetail: CaseDetail
  documents: DocumentItem[]
  gaps: Gap[]
  onJumpToGaps: () => void
}) {
  const props = caseDetail.elements.flatMap((e) => e.propositions)
  const counts = {
    established: props.filter((p) => p.status === "Established").length,
    contested: props.filter((p) => p.status === "Contested").length,
    gap: props.filter((p) => p.status === "Gap").length,
  }
  const openGaps = gaps.filter((g) => g.status === "open")

  return (
    <div className="space-y-6">
      {/* Readiness + claim type */}
      <Card>
        <div className="flex items-center justify-between">
          <h3 className="text-xl text-navy">Claim readiness</h3>
          <span className="text-3xl font-semibold text-navy">
            {caseDetail.readiness}%
          </span>
        </div>
        <div className="mt-3">
          <ReadinessBar value={caseDetail.readiness} />
        </div>
        <p className="mt-3 text-sm text-muted">
          Computed from proposition statuses (Established = 1, Contested = 0.5,
          Gap = 0). Claim basis: {caseDetail.claim_type}.
        </p>
      </Card>

      {/* Stat grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Elements" value={caseDetail.elements.length} />
        <Stat label="Propositions" value={props.length} />
        <Stat label="Documents" value={documents.length} />
        <Stat label="Open gaps" value={openGaps.length} accent="error" />
      </div>

      {/* Proposition status breakdown */}
      <Card>
        <h3 className="mb-4 text-xl text-navy">Proposition status</h3>
        <div className="space-y-3">
          <StatusRow label="Established" count={counts.established} total={props.length} color="#10b981" />
          <StatusRow label="Contested" count={counts.contested} total={props.length} color="#f59e0b" />
          <StatusRow label="Gap" count={counts.gap} total={props.length} color="#9a9a9a" />
        </div>
      </Card>

      {/* Top gaps preview */}
      {openGaps.length > 0 && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xl text-navy">Priority gaps</h3>
            <button
              onClick={onJumpToGaps}
              className="text-sm font-semibold text-primary hover:underline cursor-pointer"
            >
              View all →
            </button>
          </div>
          <div className="space-y-3">
            {openGaps.slice(0, 3).map((g) => (
              <div
                key={g.id}
                className="flex items-start justify-between gap-3 rounded-md border border-[#fecaca] border-l-4 border-l-error bg-[#fef2f2] p-3"
              >
                <div>
                  <p className="text-sm font-semibold text-navy">{g.title}</p>
                  <p className="mt-0.5 text-xs text-muted">{g.why}</p>
                </div>
                <SeverityBadge severity={g.severity} />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent?: "error"
}) {
  return (
    <Card className="!p-4">
      <p
        className={`text-3xl font-semibold ${
          accent === "error" && value > 0 ? "text-error" : "text-navy"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs uppercase tracking-wide text-muted">{label}</p>
    </Card>
  )
}

function StatusRow({
  label,
  count,
  total,
  color,
}: {
  label: string
  count: number
  total: number
  color: string
}) {
  const pct = total ? Math.round((count / total) * 100) : 0
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-navy">{label}</span>
        <span className="text-muted">{count}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-subtle">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}
