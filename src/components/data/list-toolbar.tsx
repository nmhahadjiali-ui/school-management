"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import { Loader2, Search } from "lucide-react"

export type FilterDef = { name: string; label: string; options: { value: string; label: string }[]; allLabel?: string }

/**
 * Search box + filter selects that write to the URL (the server does the
 * querying). Search is debounced; any change resets to page 1.
 */
export function ListToolbar({ searchPlaceholder, filters = [] }: { searchPlaceholder?: string; filters?: FilterDef[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [q, setQ] = useState(params.get("q") ?? "")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    next.delete("page")
    const qs = next.toString()
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3" role="search">
      {searchPlaceholder !== undefined && (
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search"
            value={q}
            placeholder={searchPlaceholder}
            aria-label="Search"
            onChange={(e) => {
              const value = e.target.value
              setQ(value)
              if (timer.current) clearTimeout(timer.current)
              timer.current = setTimeout(() => update({ q: value.trim() }), 350)
            }}
            className="h-9 w-full rounded-md border border-border bg-surface pl-8 pr-3 text-sm"
          />
        </div>
      )}
      {filters.map((f) => (
        <select
          key={f.name}
          aria-label={f.label}
          value={params.get(f.name) ?? ""}
          onChange={(e) => update({ [f.name]: e.target.value })}
          className="h-9 max-w-56 rounded-md border border-border bg-surface px-2 text-sm"
        >
          <option value="">{f.allLabel ?? `All ${f.label.toLowerCase()}`}</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
      {pending && <Loader2 className="size-4 animate-spin text-muted" aria-label="Loading" />}
    </div>
  )
}
