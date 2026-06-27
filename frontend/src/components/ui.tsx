/*
  Primitive UI components mapped directly to DESIGN_SYSTEM.md.
  These are presentational only — no data fetching — so they're safe to reuse
  unchanged once the backend is wired in.
*/
import type { ButtonHTMLAttributes, ReactNode } from "react"
import type {
  ElementStatus,
  EvidenceClassification,
  GapSeverity,
} from "../types"

// ── Button — DESIGN_SYSTEM.md §4 ────────────────────────────────────────────
type ButtonVariant = "primary" | "secondary" | "small"
export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const base =
    "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 cursor-pointer"
  const variants: Record<ButtonVariant, string> = {
    primary:
      "bg-navy text-white px-5 py-3 rounded-[24px] text-sm hover:bg-navy-dark hover:shadow-[0_4px_6px_rgba(0,0,0,0.12)]",
    secondary:
      "bg-transparent border border-border text-navy px-5 py-3 rounded-[24px] text-sm hover:border-primary hover:text-primary",
    small:
      "bg-subtle text-navy px-3 py-2 rounded-md text-xs hover:bg-border",
  }
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />
}

// ── Card — DESIGN_SYSTEM.md §4 ──────────────────────────────────────────────
export function Card({
  children,
  className = "",
  hover = false,
  onClick,
}: {
  children: ReactNode
  className?: string
  hover?: boolean
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-surface rounded-lg p-6 shadow-[0_1px_3px_rgba(0,0,0,0.08)] ${
        hover
          ? "transition-shadow duration-200 hover:shadow-[0_4px_6px_rgba(0,0,0,0.12)] cursor-pointer"
          : ""
      } ${className}`}
    >
      {children}
    </div>
  )
}

// ── Status badge (Element / Proposition) — DESIGN_SYSTEM.md §4 ──────────────
const STATUS_STYLES: Record<ElementStatus, string> = {
  Established: "bg-success text-white",
  Contested: "bg-warning text-white",
  Gap: "bg-muted text-white",
}
export function StatusBadge({ status }: { status: ElementStatus }) {
  return (
    <span
      className={`inline-block px-3 py-1 rounded-xl text-xs font-semibold ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  )
}

// ── Evidence classification tag — DESIGN_SYSTEM.md §4 ────────────────────────
const CLASS_STYLES: Record<EvidenceClassification, string> = {
  Supportive: "bg-success/10 text-success border border-success/30",
  Adverse: "bg-error/10 text-error border border-error/30",
  Neutral: "bg-muted/10 text-muted border border-muted/30",
}
export function ClassificationTag({ value }: { value: EvidenceClassification }) {
  return (
    <span
      className={`inline-block px-3 py-1.5 rounded-md text-xs font-medium ${CLASS_STYLES[value]}`}
    >
      {value}
    </span>
  )
}

// ── Severity badge (gaps) ───────────────────────────────────────────────────
const SEVERITY_STYLES: Record<GapSeverity, string> = {
  Critical: "bg-error text-white",
  High: "bg-warning text-white",
  Medium: "bg-muted text-white",
}
export function SeverityBadge({ severity }: { severity: GapSeverity }) {
  return (
    <span
      className={`inline-block px-2.5 py-1 rounded-md text-xs font-semibold ${SEVERITY_STYLES[severity]}`}
    >
      {severity}
    </span>
  )
}

// ── Loading spinner — DESIGN_SYSTEM.md §8 ───────────────────────────────────
export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted">
      <svg
        className="animate-spin-slow"
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        style={{ color: "#06b6d4" }}
        strokeWidth="2.5"
      >
        <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
      </svg>
      {label && <p className="text-sm">{label}</p>}
    </div>
  )
}

// ── Readiness meter ─────────────────────────────────────────────────────────
export function ReadinessBar({ value }: { value: number }) {
  const color = value >= 75 ? "#10b981" : value >= 40 ? "#f59e0b" : "#ef4444"
  return (
    <div className="w-full">
      <div className="h-2 w-full rounded-full bg-subtle overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
    </div>
  )
}

// ── Modal / overlay — DESIGN_SYSTEM.md §4 ───────────────────────────────────
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[600px] rounded-xl bg-surface p-8 shadow-[0_20px_25px_rgba(0,0,0,0.15)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-2xl">{title}</h3>
          <button
            onClick={onClose}
            className="text-muted hover:text-navy text-2xl leading-none cursor-pointer"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
