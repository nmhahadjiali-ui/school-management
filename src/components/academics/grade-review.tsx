"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/misc"
import { useToast } from "@/components/ui/toast"
import { reviewGrades } from "@/lib/actions/operations"
import type { GradeStatus } from "@/types/domain"

type Row = {
  id: string
  student: string
  studentId: string
  number: string
  klass: string
  period: string
  teacher: string
  score: number
  status: GradeStatus
}

type Action = "approve" | "return" | "lock" | "unlock"
const NEEDS_REASON: Action[] = ["return", "unlock"]

/** Selectable grade list with bulk review actions (the database enforces each transition). */
export function GradeReviewTable({ rows, editSlot }: { rows: Row[]; editSlot: Record<string, React.ReactNode> }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [reason, setReason] = useState("")
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const all = rows.length > 0 && selected.size === rows.length
  const chosen = rows.filter((r) => selected.has(r.id))
  const can = (a: Action) =>
    chosen.length > 0 && chosen.some((r) => (a === "approve" ? r.status === "submitted" : a === "return" ? r.status === "submitted" || r.status === "approved" : a === "lock" ? r.status === "approved" : r.status === "locked"))

  const run = (action: Action) =>
    startTransition(async () => {
      setError(null)
      if (NEEDS_REASON.includes(action) && !reason.trim()) {
        setError("Enter a reason for this change; it is kept in each grade's history.")
        return
      }
      const result = await reviewGrades({ ids: [...selected], action, reason: reason.trim() || null })
      if (result.ok) {
        toast?.(result.message ?? "Done.")
        setSelected(new Set())
        setReason("")
      } else setError(result.error)
    })

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-slate-50 px-4 py-2.5">
        <span className="text-sm text-muted">{selected.size} selected</span>
        <Button size="sm" disabled={pending || !can("approve")} onClick={() => run("approve")}>Approve</Button>
        <Button size="sm" variant="secondary" disabled={pending || !can("lock")} onClick={() => run("lock")}>Lock</Button>
        <Button size="sm" variant="secondary" disabled={pending || !can("return")} onClick={() => run("return")}>Return to teacher</Button>
        <Button size="sm" variant="secondary" disabled={pending || !can("unlock")} onClick={() => run("unlock")}>Unlock</Button>
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Reason (required to return or unlock)" aria-label="Reason" className="h-8 min-w-56 flex-1 rounded-md border border-border bg-surface px-2 text-sm" />
        {pending && <Loader2 className="size-4 animate-spin text-muted" aria-label="Working" />}
      </div>
      {error && <Alert tone="error" className="m-4">{error}</Alert>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" aria-label="Grades">
          <thead>
            <tr className="border-b border-border bg-slate-50 text-xs font-semibold uppercase tracking-wide text-muted">
              <th scope="col" className="w-10 px-4 py-2.5">
                <input type="checkbox" aria-label="Select all" checked={all} onChange={() => setSelected(all ? new Set() : new Set(rows.map((r) => r.id)))} />
              </th>
              <th scope="col" className="px-4 py-2.5">Student</th>
              <th scope="col" className="px-4 py-2.5">Class</th>
              <th scope="col" className="px-4 py-2.5">Period</th>
              <th scope="col" className="px-4 py-2.5 text-right">Score</th>
              <th scope="col" className="px-4 py-2.5">Status</th>
              <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border">
                <td className="px-4 py-2.5">
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.student}`}
                    checked={selected.has(r.id)}
                    onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n })}
                  />
                </td>
                <td className="px-4 py-2.5">
                  <Link href={`/students/${r.studentId}`} className="font-medium text-brand hover:underline">{r.student}</Link>
                  <p className="font-mono text-xs text-muted">{r.number}</p>
                </td>
                <td className="px-4 py-2.5">{r.klass}<p className="text-xs text-muted">{r.teacher}</p></td>
                <td className="px-4 py-2.5">{r.period}</td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{r.score}</td>
                <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-2">
                    {editSlot[r.id]}
                    <Link href={`/grades/${r.id}`} className="inline-flex h-8 items-center rounded-md px-2 text-sm text-brand hover:underline">History</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
