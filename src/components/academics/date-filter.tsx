"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTransition } from "react"

/** Date input bound to a URL parameter (server does the querying). */
export function DateFilter({ name = "date", label = "Date", value, min, max }: { name?: string; label?: string; value: string; min?: string; max?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [, startTransition] = useTransition()
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted">{label}</span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString())
          if (e.target.value) next.set(name, e.target.value)
          else next.delete(name)
          startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }))
        }}
        className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
      />
    </label>
  )
}
