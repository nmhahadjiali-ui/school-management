"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Loader2, X } from "lucide-react"
import { useFieldError } from "@/components/ui/form"

export type PickerOption = { id: string; label: string; detail?: string }

/**
 * Searchable picker for large lists (students, guardians, teachers). Queries
 * /api/lookups/:entity (RLS-scoped, max 10 results) instead of loading every
 * record into the browser. Submits the chosen id under `name`.
 */
export function RecordPicker({
  name,
  label,
  entity,
  required,
  initial,
}: {
  name: string
  label: string
  entity: "students" | "guardians" | "teachers"
  required?: boolean
  initial?: PickerOption | null
}) {
  const error = useFieldError(name)
  const id = useId()
  const [selected, setSelected] = useState<PickerOption | null>(initial ?? null)
  const [q, setQ] = useState("")
  const [options, setOptions] = useState<PickerOption[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(async () => {
      abort.current?.abort()
      const controller = new AbortController()
      abort.current = controller
      setLoading(true)
      try {
        const res = await fetch(`/api/lookups/${entity}?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        setOptions(res.ok ? ((await res.json()) as PickerOption[]) : [])
      } catch {
        // aborted or offline: keep previous options
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [q, open, entity])

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      {selected ? (
        <div className="flex items-center justify-between rounded-md border border-border bg-slate-50 px-3 py-2 text-sm">
          <span>
            <span className="font-medium">{selected.label}</span>
            {selected.detail && <span className="ml-2 text-muted">{selected.detail}</span>}
          </span>
          <button type="button" onClick={() => setSelected(null)} aria-label={`Clear ${label}`} className="text-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            id={id}
            type="search"
            role="combobox"
            aria-expanded={open}
            aria-controls={`${id}-list`}
            aria-invalid={error ? true : undefined}
            autoComplete="off"
            placeholder="Type to search…"
            value={q}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onChange={(e) => setQ(e.target.value)}
            className="block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-sm aria-[invalid=true]:border-red-500"
          />
          {loading && <Loader2 className="absolute right-2.5 top-2.5 size-4 animate-spin text-muted" aria-hidden />}
          {open && (
            <ul id={`${id}-list`} role="listbox" className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-lg">
              {options.length === 0 && !loading && <li className="px-3 py-2 text-sm text-muted">No matches</li>}
              {options.map((o) => (
                <li key={o.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setSelected(o)
                      setOpen(false)
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="font-medium">{o.label}</span>
                    {o.detail && <span className="ml-2 text-muted">{o.detail}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
