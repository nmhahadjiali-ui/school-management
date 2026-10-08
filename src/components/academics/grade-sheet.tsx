"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ConfirmAction } from "@/components/ui/confirm-dialog"
import { StatusBadge } from "@/components/ui/misc"
import { useToast } from "@/components/ui/toast"
import { saveGradeSheet } from "@/lib/actions/operations"
import type { GradeStatus } from "@/types/domain"

type Scale = { name: string; minimum_score: number; equivalent: string | null; is_passing: boolean }
type Row = { enrollment_id: string; name: string; number: string; score: string; remarks: string; status: GradeStatus | null }

const bandFor = (scales: Scale[], score: number) => scales.find((s) => score >= s.minimum_score) ?? null

/**
 * Grade entry for one class (section × subject) and grading period. Only
 * draft/new grades are editable; submitted, approved and locked grades are
 * shown read-only (the database refuses teacher changes to them anyway).
 */
export function GradeSheet({
  loadId,
  periodId,
  students,
  maxScore,
  passingScore,
  scales,
  open,
}: {
  loadId: string
  periodId: string
  students: { enrollment_id: string; name: string; number: string; score: number | null; remarks: string | null; status: GradeStatus | null }[]
  maxScore: number
  passingScore: number
  scales: Scale[]
  /** Grading period is open for entry. */
  open: boolean
}) {
  const sorted = [...scales].sort((a, b) => b.minimum_score - a.minimum_score)
  const [rows, setRows] = useState<Row[]>(() => students.map((s) => ({ ...s, score: s.score === null ? "" : String(s.score), remarks: s.remarks ?? "" })))
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const editable = (r: Row) => open && (r.status === null || r.status === "draft")
  const invalid = rows.filter((r) => r.score !== "" && (Number.isNaN(Number(r.score)) || Number(r.score) < 0 || Number(r.score) > maxScore))
  const drafts = rows.filter((r) => editable(r) && r.score !== "")

  const save = (submit: boolean) =>
    new Promise<{ ok: boolean; error?: string; message?: string }>((resolve) =>
      startTransition(async () => {
        setError(null)
        const result = await saveGradeSheet({
          load_id: loadId,
          period_id: periodId,
          submit,
          entries: rows.filter(editable).map((r) => ({ enrollment_id: r.enrollment_id, score: r.score === "" ? null : Number(r.score), remarks: r.remarks || null })),
        })
        if (result.ok) {
          toast?.(result.message ?? "Saved.")
          if (submit) setRows((rs) => rs.map((r) => (editable(r) && r.score !== "" ? { ...r, status: "submitted" } : r)))
          else setRows((rs) => rs.map((r) => (editable(r) && r.score !== "" ? { ...r, status: "draft" } : r)))
          resolve({ ok: true, message: result.message })
        } else {
          setError(result.error)
          resolve({ ok: false, error: result.error })
        }
      })
    )

  return (
    <div>
      {!open && <Alert tone="info" className="m-4">This grading period is not open for grade entry. Grades are shown read-only.</Alert>}
      {error && <Alert tone="error" className="m-4">{error}</Alert>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label="Grade entry">
          <thead>
            <tr className="border-b border-border bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <th scope="col" className="px-4 py-2.5">Student</th>
              <th scope="col" className="w-32 px-4 py-2.5">Score (0–{maxScore})</th>
              <th scope="col" className="px-4 py-2.5">Descriptor</th>
              <th scope="col" className="px-4 py-2.5">Remarks</th>
              <th scope="col" className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const n = Number(r.score)
              const bad = r.score !== "" && (Number.isNaN(n) || n < 0 || n > maxScore)
              const band = r.score !== "" && !bad ? bandFor(sorted, n) : null
              const failing = r.score !== "" && !bad && (band ? !band.is_passing : n < passingScore)
              return (
                <tr key={r.enrollment_id} className="border-b border-border">
                  <td className="px-4 py-2">
                    <p className="font-medium">{r.name}</p>
                    <p className="font-mono text-xs text-muted">{r.number}</p>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={0}
                      max={maxScore}
                      aria-label={`Score for ${r.name}`}
                      aria-invalid={bad || undefined}
                      disabled={!editable(r)}
                      value={r.score}
                      onChange={(e) => setRows((rs) => rs.map((x) => (x.enrollment_id === r.enrollment_id ? { ...x, score: e.target.value } : x)))}
                      className="h-9 w-24 rounded-md border border-border bg-surface px-2 text-right tabular-nums disabled:bg-slate-50 aria-[invalid=true]:border-red-500"
                    />
                  </td>
                  <td className={failing ? "px-4 py-2 font-medium text-red-700" : "px-4 py-2 text-muted"}>
                    {bad ? <span className="text-red-600">Out of range</span> : band ? `${band.name}${band.equivalent ? ` (${band.equivalent})` : ""}` : r.score !== "" ? (failing ? "Below passing" : "") : ""}
                  </td>
                  <td className="px-4 py-2">
                    <input
                      aria-label={`Remarks for ${r.name}`}
                      disabled={!editable(r)}
                      value={r.remarks}
                      maxLength={500}
                      onChange={(e) => setRows((rs) => rs.map((x) => (x.enrollment_id === r.enrollment_id ? { ...x, remarks: e.target.value } : x)))}
                      className="h-9 w-full min-w-40 rounded-md border border-border bg-surface px-2 disabled:bg-slate-50"
                    />
                  </td>
                  <td className="px-4 py-2">{r.status ? <StatusBadge status={r.status} /> : <span className="text-xs text-muted">Not entered</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {open && (
        <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur">
          {invalid.length > 0 && <span className="text-sm text-red-600">{invalid.length} score{invalid.length === 1 ? " is" : "s are"} out of range</span>}
          <Button variant="secondary" onClick={() => void save(false)} disabled={pending || invalid.length > 0 || drafts.length === 0}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Save draft
          </Button>
          <ConfirmAction
            size="md"
            trigger={`Submit ${drafts.length || ""} for review`.replace("  ", " ")}
            title="Submit grades for review?"
            description="Submitted grades go to the school administrator for approval. You will not be able to change them unless they are returned to you."
            confirmLabel="Submit"
            onConfirm={async () => {
              if (invalid.length > 0) return { ok: false, error: "Fix the scores that are out of range first." }
              if (drafts.length === 0) return { ok: false, error: "There are no grades to submit." }
              const r = await save(true)
              return r.ok ? { ok: true } : { ok: false, error: r.error ?? "Could not submit." }
            }}
          />
        </div>
      )}
    </div>
  )
}
