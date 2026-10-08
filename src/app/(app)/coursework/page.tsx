import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { Plus } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { LinkButton } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/misc"
import { ListToolbar } from "@/components/data/list-toolbar"
import { Pagination, SortTh, TableSkeleton } from "@/components/data/list"
import { requireActiveUser } from "@/lib/auth/session"
import { formatDateTime, isPast } from "@/lib/dates"
import { isUuid, parseListParams, type SearchParams } from "@/lib/list-params"
import { sectionOptions, subjectOptions } from "@/lib/options"
import { createClient } from "@/lib/supabase/server"
import { listActiveSubjects, listSectionOptions, studentEnrollments } from "@/services/academic"
import { COURSEWORK_SORTS, listCoursework } from "@/services/operations"
import type { UserContext } from "@/types/domain"

export const metadata: Metadata = { title: "Assignments" }

/**
 * Admin: all coursework of the school. Teacher: their own. Student: their
 * section's published work with submission status. (RLS enforces each scope.)
 */
export default async function CourseworkPage({ searchParams }: PageProps<"/coursework">) {
  const ctx = await requireActiveUser()
  const role = ctx.profile.role
  if (!["school_admin", "teacher", "student"].includes(role) || !ctx.features.includes("coursework")) redirect("/dashboard?denied=1")
  const sp = await searchParams
  const year = ctx.current_academic_year
  const canCreate = role === "teacher" || role === "school_admin"
  const [sections, subjects] = role === "student" || !year ? [{ data: [] }, { data: [] }] : await Promise.all([listSectionOptions(ctx.profile.school_id!, year.id), listActiveSubjects(ctx.profile.school_id!)])

  return (
    <>
      <PageHeader
        title="Assignments"
        description={role === "student" ? "Homework and coursework for your class." : role === "teacher" ? "Coursework you have given your classes." : "All coursework in the school."}
        actions={canCreate && year ? <LinkButton href="/coursework/new"><Plus className="size-4" aria-hidden /> New assignment</LinkButton> : null}
      />
      {!year && <Alert tone="info" className="mb-4">No current academic year is set.</Alert>}
      <Card>
        <ListToolbar
          searchPlaceholder="Search title…"
          filters={
            role === "student"
              ? []
              : [
                  { name: "section", label: "Sections", options: sectionOptions((sections.data ?? []) as { id: string; name: string; grade_level: { name: string } | null }[]) },
                  { name: "subject", label: "Subjects", options: subjectOptions((subjects.data ?? []) as { id: string; name: string; code: string }[]) },
                  { name: "status", label: "Statuses", options: [{ value: "published", label: "Published" }, { value: "draft", label: "Draft" }, { value: "archived", label: "Archived" }] },
                ]
          }
        />
        {year && (
          <Suspense key={JSON.stringify(sp)} fallback={<TableSkeleton />}>
            <CourseworkTable ctx={ctx} yearId={year.id} sp={sp} />
          </Suspense>
        )}
      </Card>
    </>
  )
}

async function CourseworkTable({ ctx, yearId, sp }: { ctx: UserContext; yearId: string; sp: SearchParams }) {
  const role = ctx.profile.role
  const p = parseListParams(sp, { sorts: COURSEWORK_SORTS, defaultSort: "due_at", defaultDir: "desc", filters: ["section", "subject", "status"] })
  for (const f of ["section", "subject"]) if (p.filters[f] && !isUuid(p.filters[f])) delete p.filters[f]
  if (p.filters.status && !["published", "draft", "archived"].includes(p.filters.status)) delete p.filters.status

  let sectionIds: string[] | undefined
  let studentId: string | null = null
  if (role === "student") {
    studentId = ctx.record?.type === "student" ? ctx.record.id : null
    const { data } = studentId ? await studentEnrollments(studentId) : { data: [] }
    sectionIds = (data ?? []).filter((e) => e.academic_year_id === yearId && e.section).map((e) => e.section!.id)
    p.filters.status = "published"
  }
  const page = await listCoursework(p, {
    schoolId: ctx.profile.school_id!,
    yearId,
    teacherId: role === "teacher" && ctx.record?.type === "teacher" ? ctx.record.id : undefined,
    sectionIds,
  })
  if (page.error) return <Alert tone="error" className="m-4">Assignments could not be loaded.</Alert>
  if (page.total === 0) return <EmptyState title="No assignments" description={role === "teacher" ? "Create an assignment for one of your classes." : undefined} />

  let submitted = new Map<string, string>()
  if (studentId) {
    const supabase = await createClient()
    const { data } = await supabase.from("assignment_submissions").select("assignment_id, status").eq("student_id", studentId).in("assignment_id", page.rows.map((r) => r.id))
    submitted = new Map((data ?? []).map((s) => [s.assignment_id, s.status]))
  }
  const sort = { pathname: "/coursework", searchParams: sp, current: p }
  return (
    <>
      <Table label="Assignments">
        <thead>
          <tr>
            <SortTh label="Title" sortKey="title" {...sort} />
            <Th>Class</Th>
            <SortTh label="Due" sortKey="due_at" {...sort} />
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {page.rows.map((a) => {
            const overdue = isPast(a.due_at)
            const sub = submitted.get(a.id)
            return (
              <tr key={a.id} className="hover:bg-slate-50">
                <Td><Link href={`/coursework/${a.id}`} className="font-medium text-brand hover:underline">{a.title}</Link></Td>
                <Td>{a.subject.name} <span className="text-muted">· {a.section.grade_level.name} – {a.section.name}</span></Td>
                <Td className={overdue ? "text-muted" : ""}>{a.due_at ? formatDateTime(a.due_at, ctx.school?.timezone) : "—"}</Td>
                <Td>
                  {studentId ? (
                    sub ? <StatusBadge status={sub} /> : overdue ? <Badge tone="red">Missing</Badge> : <Badge tone="amber">To do</Badge>
                  ) : (
                    <StatusBadge status={a.status} />
                  )}
                </Td>
              </tr>
            )
          })}
        </tbody>
      </Table>
      <Pagination pathname="/coursework" searchParams={sp} page={page.page} pageSize={page.pageSize} total={page.total} />
    </>
  )
}
