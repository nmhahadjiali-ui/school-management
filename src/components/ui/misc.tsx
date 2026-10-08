import { Inbox } from "lucide-react"
import { cn } from "@/lib/utils"
import { ROLE_LABELS } from "@/lib/auth/permissions"
import type { AppRole, ProfileStatus, SchoolStatus } from "@/types/domain"

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: string
  description?: React.ReactNode
  eyebrow?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-wide text-brand">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </header>
  )
}

const badgeTones = {
  green: "bg-green-50 text-green-700 ring-green-600/20",
  gray: "bg-slate-100 text-slate-700 ring-slate-500/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  blue: "bg-blue-50 text-blue-700 ring-blue-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
}

export function Badge({ tone = "gray", children }: { tone?: keyof typeof badgeTones; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", badgeTones[tone])}>
      {children}
    </span>
  )
}

const STATUS_TONES: Record<string, keyof typeof badgeTones> = {
  active: "green",
  enrolled: "green",
  pending: "amber",
  planned: "amber",
  graduated: "blue",
  completed: "blue",
  transferred: "blue",
  withdrawn: "red",
  resigned: "gray",
  retired: "gray",
  inactive: "gray",
  archived: "gray",
  expired: "gray",
  revoked: "gray",
  accepted: "green",
  open: "green",
  upcoming: "amber",
  closed: "gray",
  locked: "gray",
  draft: "amber",
  submitted: "blue",
  approved: "green",
  published: "green",
  present: "green",
  absent: "red",
  late: "amber",
  excused: "blue",
  reviewed: "green",
  // Finance
  paid: "green",
  partially_paid: "amber",
  overdue: "red",
  cancelled: "gray",
  reversed: "red",
  issued: "green",
  voided: "gray",
  requested: "amber",
  rejected: "red",
  processed: "blue",
  initiated: "amber",
  successful: "green",
  failed: "red",
}

/** Badge for any status enum value (schools, profiles, records, enrollments, invitations). */
export function StatusBadge({ status }: { status: SchoolStatus | ProfileStatus | (string & {}) }) {
  return <Badge tone={STATUS_TONES[status] ?? "gray"}>{(status.charAt(0).toUpperCase() + status.slice(1)).replace("_", " ")}</Badge>
}

export function RoleBadge({ role }: { role: AppRole }) {
  return <Badge tone={role === "super_admin" || role === "school_admin" ? "blue" : "gray"}>{ROLE_LABELS[role]}</Badge>
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <Inbox className="size-10 text-slate-300" aria-hidden />
      <p className="mt-3 font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function StatCard({ label, value, hint }: { label: string; value: number | null; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">
        {value === null ? <span className="text-slate-300" aria-label="Not available yet">—</span> : value.toLocaleString()}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-slate-200", className)} aria-hidden />
}

/** Responsive table wrapper: scrolls horizontally on small screens. */
export function Table({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm" aria-label={label}>
        {children}
      </table>
    </div>
  )
}
export const Th = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <th scope="col" className={cn("border-b border-border bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted", className)}>
    {children}
  </th>
)
export const Td = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <td className={cn("border-b border-border px-4 py-3 align-middle", className)}>{children}</td>
)
