import type { Metadata } from "next"
import Link from "next/link"
import { Alert } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import { EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/misc"
import { ListToolbar } from "@/components/data/list-toolbar"
import { Pagination } from "@/components/data/list"
import { studentLabel } from "@/components/finance/finance-ui"
import { requireFinance } from "@/lib/finance/access"
import { formatDateTime } from "@/lib/dates"
import { parseListParams } from "@/lib/list-params"
import { actorNames, auditLog, studentsById } from "@/services/finance"

export const metadata: Metadata = { title: "Financial audit log" }

const short = (v: unknown) => {
  if (v === null || v === undefined) return ""
  const s = JSON.stringify(v)
  return s.length > 160 ? `${s.slice(0, 160)}…` : s
}

export default async function AuditPage({ searchParams }: PageProps<"/finance/audit">) {
  const ctx = await requireFinance("admin")
  const sp = await searchParams
  const p = parseListParams(sp, { sorts: ["created_at"] as const, defaultSort: "created_at", defaultDir: "desc", filters: ["action"] })
  p.filters.action = p.filters.action ?? p.q
  if (!p.filters.action) delete p.filters.action
  const page = await auditLog(ctx.schoolId, p)
  const [names, students] = await Promise.all([actorNames(page.rows.map((r) => r.actor_user_id)), studentsById(page.rows.map((r) => r.student_id ?? ""))])
  const tz = ctx.school?.timezone

  return (
    <>
      <PageHeader eyebrow="Finance" title="Financial audit log" description="Append-only: who did what, when, with previous and new values and the reason. Entries cannot be changed or deleted." />
      <Card>
        <ListToolbar searchPlaceholder="Filter by action, e.g. payment, refund, discount…" />
        {page.error ? <Alert tone="error" className="m-4">The audit log could not be loaded.</Alert> : page.total === 0 ? <EmptyState title="No entries" /> : (
          <>
            <Table label="Audit entries">
              <thead><tr><Th>When</Th><Th>Who</Th><Th>Action</Th><Th>Student</Th><Th>Change</Th><Th>Reason</Th></tr></thead>
              <tbody>
                {page.rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <Td className="whitespace-nowrap text-xs">{formatDateTime(r.created_at, tz)}</Td>
                    <Td className="text-xs">{r.actor_user_id ? (names.get(r.actor_user_id) ?? "Staff member") : "System / provider"}</Td>
                    <Td className="font-mono text-xs">{r.action}</Td>
                    <Td className="text-xs">{r.student_id ? <Link href={`/finance/students/${r.student_id}`} className="text-brand hover:underline">{studentLabel(students.get(r.student_id))}</Link> : "—"}</Td>
                    <Td className="max-w-md break-all font-mono text-[11px] text-muted">
                      {r.old_values ? <span className="block">− {short(r.old_values)}</span> : null}
                      {r.new_values ? <span className="block">+ {short(r.new_values)}</span> : null}
                    </Td>
                    <Td className="text-xs">{r.reason ?? ""}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination pathname="/finance/audit" searchParams={sp} page={page.page} pageSize={page.pageSize} total={page.total} />
          </>
        )}
      </Card>
    </>
  )
}
