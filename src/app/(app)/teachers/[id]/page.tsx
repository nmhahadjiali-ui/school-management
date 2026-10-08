import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { Pencil, Plus } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { LinkButton } from "@/components/ui/button"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { ConfirmAction } from "@/components/ui/confirm-dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Badge, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/misc"
import { DescriptionList, TableSkeleton } from "@/components/data/list"
import { AccountPanel } from "@/components/school/account-panel"
import { AssignmentFields } from "@/components/school/fields"
import { createAssignment, deleteAssignment } from "@/lib/actions/academic"
import { requireActiveUser } from "@/lib/auth/session"
import { personName, sectionOptions, subjectOptions } from "@/lib/options"
import { uuidSchema } from "@/lib/validations"
import { listActiveSubjects, listSectionOptions, teacherAssignments } from "@/services/academic"
import { getTeacher, teacherAdvisory } from "@/services/people"
import type { Teacher, UserContext } from "@/types/domain"

export const metadata: Metadata = { title: "Teacher" }

/** Teacher profile: school admins (manage) and the teacher themself (view). */
export default async function TeacherPage({ params, searchParams }: PageProps<"/teachers/[id]">) {
  const ctx = await requireActiveUser()
  const { id } = await params
  const { created } = await searchParams
  if (!uuidSchema.safeParse(id).success) notFound()
  const { data: teacher, error } = await getTeacher(id)
  if (error) throw new Error("Unable to load teacher")
  if (!teacher) notFound()
  const isAdmin = ctx.profile.role === "school_admin" && ctx.profile.school_id === teacher.school_id

  return (
    <>
      <PageHeader
        eyebrow="Teacher"
        title={personName(teacher)}
        description={<StatusBadge status={teacher.status} />}
        actions={isAdmin ? <LinkButton href={`/teachers/${teacher.id}/edit`} variant="secondary"><Pencil className="size-4" aria-hidden /> Edit</LinkButton> : null}
      />
      {created && <Alert tone="success" className="mb-6">Teacher created. Next: assign subjects and send an invitation.</Alert>}
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Suspense fallback={<Card><TableSkeleton rows={4} /></Card>}>
          <Teaching teacher={teacher} ctx={ctx} isAdmin={isAdmin} />
        </Suspense>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Personal & contact information" />
            <CardBody>
              <DescriptionList items={[["Full name", personName(teacher)], ["Email", teacher.email], ["Phone", teacher.phone]]} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Employee information" />
            <CardBody>
              <DescriptionList items={[["Employee number", teacher.employee_number], ["Specialization", teacher.specialization], ["Status", <StatusBadge key="s" status={teacher.status} />]]} />
            </CardBody>
          </Card>
          {isAdmin && (
            <Suspense fallback={<Card><TableSkeleton rows={2} /></Card>}>
              <AccountPanel type="teacher" record={teacher} />
            </Suspense>
          )}
        </div>
      </div>
    </>
  )
}

async function Teaching({ teacher, ctx, isAdmin }: { teacher: Teacher; ctx: UserContext; isAdmin: boolean }) {
  const year = ctx.current_academic_year
  const canAssign = isAdmin && year && teacher.status === "active"
  const [assignments, advisory, subjects, sections] = await Promise.all([
    teacherAssignments(teacher.id),
    teacherAdvisory(teacher.id),
    canAssign ? listActiveSubjects(teacher.school_id) : Promise.resolve({ data: [] }),
    canAssign ? listSectionOptions(teacher.school_id, year.id) : Promise.resolve({ data: [] }),
  ])
  const rows = assignments.data ?? []
  const current = rows.filter((a) => a.academic_year_id === year?.id)
  const past = rows.filter((a) => a.academic_year_id !== year?.id)
  const advised = advisory.data ?? []
  const sectionLink = (s: { id: string; name: string }, grade: string) => <Link href={`/sections/${s.id}`} className="text-brand hover:underline">{grade} – {s.name}</Link>

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Current assignments"
          description={year ? year.name : "No current academic year"}
          action={
            canAssign ? (
              <FormDialog trigger={<><Plus className="size-4" aria-hidden /> Assign</>} size="sm" title={`Assign a subject (${year.name})`} action={createAssignment} submitLabel="Assign">
                <AssignmentFields yearId={year.id} teacherId={teacher.id} subjects={subjectOptions(subjects.data ?? [])} sections={sectionOptions((sections.data ?? []) as { id: string; name: string; grade_level: { name: string } | null }[])} />
              </FormDialog>
            ) : null
          }
        />
        {current.length === 0 ? (
          <EmptyState title="No assignments this year" />
        ) : (
          <Table label="Current assignments">
            <thead>
              <tr>
                <Th>Subject</Th>
                <Th>Section</Th>
                {isAdmin && <Th className="text-right"><span className="sr-only">Actions</span></Th>}
              </tr>
            </thead>
            <tbody>
              {current.map((a) => (
                <tr key={a.id}>
                  <Td className="font-medium">{a.subject.name} <Badge>{a.subject.code}</Badge></Td>
                  <Td>{sectionLink(a.section, a.section.grade_level.name)}</Td>
                  {isAdmin && (
                    <Td className="text-right">
                      <ConfirmAction destructive trigger="Remove" title="Remove this assignment?" description={`${a.subject.name} in ${a.section.grade_level.name} – ${a.section.name}.`} confirmLabel="Remove" onConfirm={deleteAssignment.bind(null, a.id)} />
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader title="Advisory sections" description="Sections where this teacher is the adviser / class teacher." />
        {advised.length === 0 ? (
          <EmptyState title="Not an adviser of any section" />
        ) : (
          <ul className="divide-y divide-border">
            {advised.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-5 py-3 text-sm">
                {sectionLink(s, s.grade_level.name)}
                <span className="text-muted">{s.academic_year.name}{s.academic_year.is_current && " (current)"}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {past.length > 0 && (
        <Card>
          <CardHeader title="Past assignments" />
          <Table label="Past assignments">
            <thead>
              <tr>
                <Th>Year</Th>
                <Th>Subject</Th>
                <Th>Section</Th>
              </tr>
            </thead>
            <tbody>
              {past.map((a) => (
                <tr key={a.id}>
                  <Td>{a.academic_year.name}</Td>
                  <Td>{a.subject.name}</Td>
                  <Td>{a.section.grade_level.name} – {a.section.name}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  )
}
