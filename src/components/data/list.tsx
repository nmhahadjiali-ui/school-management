import Link from "next/link"
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react"
import { Skeleton } from "@/components/ui/misc"
import { listHref, type SearchParams } from "@/lib/list-params"
import { cn } from "@/lib/utils"

/** Column header that toggles server-side sorting via the URL. */
export function SortTh({
  label,
  sortKey,
  pathname,
  searchParams,
  current,
  className,
}: {
  label: string
  sortKey: string
  pathname: string
  searchParams: SearchParams
  current: { sort: string; dir: "asc" | "desc" }
  className?: string
}) {
  const active = current.sort === sortKey
  const nextDir = active && current.dir === "asc" ? "desc" : "asc"
  const Icon = active ? (current.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <th
      scope="col"
      aria-sort={active ? (current.dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn("border-b border-border bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted", className)}
    >
      <Link href={listHref(pathname, searchParams, { sort: sortKey, dir: nextDir, page: null })} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        <Icon className={cn("size-3", !active && "opacity-40")} aria-hidden />
      </Link>
    </th>
  )
}

/** "Showing 21–40 of 312" with previous/next links. */
export function Pagination({
  pathname,
  searchParams,
  page,
  pageSize,
  total,
}: {
  pathname: string
  searchParams: SearchParams
  page: number
  pageSize: number
  total: number
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total === 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  const linkClass = "inline-flex h-8 items-center gap-1 rounded-md border border-border bg-surface px-2.5 text-sm hover:bg-slate-50"
  const disabledClass = "inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-sm opacity-40"
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm text-muted">
      <p>
        Showing <span className="font-medium text-foreground">{from}</span>–<span className="font-medium text-foreground">{to}</span> of{" "}
        <span className="font-medium text-foreground">{total.toLocaleString()}</span>
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={listHref(pathname, searchParams, { page: page - 1 === 1 ? null : page - 1 })} className={linkClass} rel="prev">
            <ChevronLeft className="size-4" aria-hidden /> Previous
          </Link>
        ) : (
          <span className={disabledClass} aria-disabled="true">
            <ChevronLeft className="size-4" aria-hidden /> Previous
          </span>
        )}
        <span>
          Page {page} of {pages}
        </span>
        {page < pages ? (
          <Link href={listHref(pathname, searchParams, { page: page + 1 })} className={linkClass} rel="next">
            Next <ChevronRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <span className={disabledClass} aria-disabled="true">
            Next <ChevronRight className="size-4" aria-hidden />
          </span>
        )}
      </div>
    </nav>
  )
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9" />
      ))}
    </div>
  )
}

/** Label/value pairs for profile pages. */
export function DescriptionList({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
      {items.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd className="break-words">{value ?? <span className="text-slate-400">—</span>}</dd>
        </div>
      ))}
    </dl>
  )
}
