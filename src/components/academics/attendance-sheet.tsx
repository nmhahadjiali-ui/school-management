"use client"

import { useMemo, useState, useTransition } from "react"
import { Loader2, MessageSquarePlus } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { saveAttendance } from "@/lib/actions/operations"
import { cn } from "@/lib/utils"
import type { AttendanceStatus } from "@/types/domain"

type Row = { enrollment_id: string; name: string; number: string; status: AttendanceStatus; remarks: string }

const STATUSES: { value: AttendanceStatus; label: string; short: string; tone: string }[] = [
  { value: "present", label: "Present", short: "P", tone: "bg-green-600 text-white border-green-600" },
  { value: "absent", label: "Absent", short: "A", tone: "bg-red-600 text-white border-red-600" },
  { value: "late", label: "Late", short: "L", tone: "bg-amber-500 text-white border-amber-500" },
  { value: "excused", label: "Excused", short: "E", tone: "bg-blue-600 text-white border-blue-600" },
]

/**
 * Fast daily attendance: everyone defaults to Present; tap to change; one
 * save for the whole class (a single database transaction).
 */
export function AttendanceSheet({
  sectionId,
  date,
  students,
  editable,
  recorded,
}: {
  sectionId: string
  date: string
  students: { enrollment_id: string; name: string; number: string; status: AttendanceStatus | null; remarks: string | null }[]
  editable: boolean
  /** Attendance already saved for this date. */
  recorded: boolean
}) {
  const initial = useMemo<Row[]>(() => students.map((s) => ({ ...s, status: s.status ?? "present", remarks: s.remarks ?? "" })), [students])
  const [rows, setRows] = useState(initial)
  const [notesOpen, setNotesOpen] = useState<Set<string>>(() => new Set(students.filter((s) => s.remarks).map((s) => s.enrollment_id)))
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const dirty = !recorded || rows.some((r, i) => r.status !== initial[i].status || r.remarks !== initial[i].remarks)
  const counts = STATUSES.map((s) => ({ ...s, n: rows.filter((r) => r.status === s.value).length }))

  const set = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.enrollment_id === id ? { ...r, ...patch } : r)))

  const save = () =>
    startTransition(async () => {
      setError(null)
      const result = await saveAttendance({
        section_id: sectionId,
        date,
        records: rows.map((r) => ({ enrollment_id: r.enrollment_id, status: r.status, remarks: r.remarks || null })),
      })
      if (result.ok) toast?.(result.message ?? "Attendance saved.")
      else setError(result.error)
    })

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <p className="flex flex-wrap gap-3 text-sm" aria-live="polite">
          {counts.map((c) => (
            <span key={c.value}>
              <span className="font-semibold tabular-nums">{c.n}</span> <span className="text-muted">{c.label.toLowerCase()}</span>
            </span>
          ))}
        </p>
        {editable && (
          <Button variant="secondary" size="sm" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, status: "present" })))}>
            Mark all present
          </Button>
        )}
      </div>
      {error && <Alert tone="error" className="m-4">{error}</Alert>}
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.enrollment_id} className="px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-40 flex-1">
                <p className="font-medium">{r.name}</p>
                <p className="font-mono text-xs text-muted">{r.number}</p>
              </div>
              <div role="radiogroup" aria-label={`Attendance for ${r.name}`} className="flex gap-1">
                {STATUSES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    role="radio"
                    aria-checked={r.status === s.value}
                    aria-label={s.label}
                    title={s.label}
                    disabled={!editable}
                    onClick={() => set(r.enrollment_id, { status: s.value })}
                    className={cn(
                      "h-9 w-9 rounded-md border text-sm font-semibold transition-colors disabled:cursor-not-allowed sm:w-auto sm:px-3",
                      r.status === s.value ? s.tone : "border-border bg-surface text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    <span className="sm:hidden">{s.short}</span>
                    <span className="hidden sm:inline">{s.label}</span>
                  </button>
                ))}
              </div>
              {editable && !notesOpen.has(r.enrollment_id) && (
                <button type="button" onClick={() => setNotesOpen((n) => new Set(n).add(r.enrollment_id))} className="rounded-md p-2 text-muted hover:bg-slate-100" aria-label={`Add remarks for ${r.name}`}>
                  <MessageSquarePlus className="size-4" />
                </button>
              )}
            </div>
            {notesOpen.has(r.enrollment_id) && (
              <input
                aria-label={`Remarks for ${r.name}`}
                value={r.remarks}
                disabled={!editable}
                maxLength={500}
                placeholder="Remarks (optional)"
                onChange={(e) => set(r.enrollment_id, { remarks: e.target.value })}
                className="mt-2 block w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
              />
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur">
          {dirty && <span className="text-sm text-muted">{recorded ? "Unsaved changes" : "Not saved yet"}</span>}
          <Button onClick={save} disabled={pending || rows.length === 0}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Save attendance
          </Button>
        </div>
      )}
    </div>
  )
}
