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
import { StudentAcademics } from "@/components/academics/student-academics"
import { AssignSectionFields, CloseEnrollmentFields, EnrollmentFields, GuardianLinkFields, TransferFields } from "@/components/school/fields"
import { assignEnrollmentSection, closeEnrollment, enrollStudent, transferStudent } from "@/lib/actions/academic"
import { unlinkGuardian, updateGuardianLink, linkGuardian } from "@/lib/actions/people"
import { requireActiveUser } from "@/lib/auth/session"
import { gradeOptions, personName, sectionOptions } from "@/lib/options"
import { formatDate } from "@/lib/utils"
import { uuidSchema } from "@/lib/validations"
import { listGradeLevels, listSectionOptions, studentEnrollments } from "@/services/academic"
import { getStudent, studentGuardians } from "@/services/people"
import type { Student, UserContext } from "@/types/domain"

export const metadata: Metadata = { title: "Student" }

const label = (s: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : null)
const d = (v: string | null) => (v ? formatDate(v, "UTC") : null)

/**
 * The student's central record. Visible to school admins, the student's
 * teachers, the student, and their guardians (RLS decides; 404 otherwise).
 * Only school admins see management actions.
 */
export default async function StudentPage({ params, searchParams }: PageProps<"/students/[id]">) {
  const ctx = await requireActiveUser()
  const { id } = await params
  const { created } = await searchParams
  if (!uuidSchema.safeParse(id).success) notFound()
  const { data: student, error } = await getStudent(id)
  if (error) throw new Error("Unable to load student")
  if (!student) notFound()

  const isAdmin = ctx.profile.role === "school_admin" && ctx.profile.school_id === student.school_id

  return (
    <>
      <PageHeader
        eyebrow={`Student · ${student.student_number}`}
        title={personName(student)}
        description={<StatusBadge status={student.status} />}
        actions={isAdmin ? <LinkButton href={`/students/${student.id}/edit`} variant="secondary"><Pencil className="size-4" aria-hidden /> Edit</LinkButton> : null}
      />
      {created && <Alert tone="success" className="mb-6">Student created. Next: enroll them and link their parents or guardians.</Alert>}
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Suspense fallback={<Card><TableSkeleton rows={3} /></Card>}>
            <Enrollments student={student} ctx={ctx} isAdmin={isAdmin} />
          </Suspense>
          {(isAdmin || ctx.profile.role === "parent") && (
            <Suspense fallback={<Card><TableSkeleton rows={2} /></Card>}>
              <Guardians student={student} isAdmin={isAdmin} />
            </Suspense>
          )}
          <Suspense fallback={<Card><TableSkeleton rows={4} /></Card>}>
            <StudentAcademics student={student} ctx={ctx} />
          </Suspense>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Personal information" />
            <CardBody>
              <DescriptionList
                items={[
                  ["Full name", personName(student)],
                  ["Student number", <span key="n" className="font-mono">{student.student_number}</span>],
                  ["Date of birth", d(student.date_of_birth)],
                  ["Gender", label(student.gender)],
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Contact information" />
            <CardBody>
              <DescriptionList items={[["Email", student.email], ["Phone", student.phone], ["Address", student.address]]} />
            </CardBody>
          </Card>
          {isAdmin && (
            <Suspense fallback={<Card><TableSkeleton rows={2} /></Card>}>
              <AccountPanel type="student" record={student} />
            </Suspense>
          )}
        </div>
      </div>
    </>
  )
}

async function Enrollments({ student, ctx, isAdmin }: { student: Student; ctx: UserContext; isAdmin: boolean }) {
  const year = ctx.current_academic_year
  const [history, grades, sections] = await Promise.all([
    studentEnrollments(student.id),
    isAdmin ? listGradeLevels(student.school_id, { status: "active" }) : Promise.resolve({ data: [] }),
    isAdmin && year ? listSectionOptions(student.school_id, year.id) : Promise.resolve({ data: [] }),
  ])
  const rows = history.data ?? []
  const current = rows.find((e) => e.enrollment_status === "enrolled" && e.academic_year_id === year?.id) ?? rows.find((e) => e.enrollment_status === "enrolled")
  const sectionOpts = (sections.data ?? []) as { id: string; name: string; grade_level_id: string; grade_level: { name: string } | null }[]
  const editable = isAdmin && current && current.academic_year.status !== "archived"

  return (
    <>
      <Card>
        <CardHeader
          title="Current enrollment"
          action={
            isAdmin && !current && year ? (
              <FormDialog trigger={<><Plus className="size-4" aria-hidden /> Enroll</>} size="sm" title={`Enroll in ${year.name}`} action={enrollStudent} submitLabel="Enroll">
                <EnrollmentFields yearId={year.id} grades={gradeOptions(grades.data ?? [])} sections={sectionOptions(sectionOpts)} student={{ id: student.id, label: personName(student) }} />
              </FormDialog>
            ) : null
          }
        />
        <CardBody>
          {current ? (
            <div className="flex flex-wrap items-start justify-between gap-4">
              <DescriptionList
                items={[
                  ["Academic year", current.academic_year.name],
                  ["Grade level", current.grade_level.name],
                  ["Section", current.section ? (isAdmin || ctx.profile.role === "teacher" ? <Link key="s" href={`/sections/${current.section.id}`} className="text-brand hover:underline">{current.section.name}</Link> : current.section.name) : <Badge key="s" tone="amber">Not assigned</Badge>],
                  ["Enrolled on", d(current.enrollment_date)],
                ]}
              />
              {editable && (
                <div className="flex flex-wrap gap-2">
                  {!current.section_id && (
                    <FormDialog trigger="Assign section" size="sm" title="Assign a section" action={assignEnrollmentSection.bind(null, current.id)}>
                      <AssignSectionFields sections={sectionOptions(sectionOpts.filter((s) => s.grade_level_id === current.grade_level_id))} />
                    </FormDialog>
                  )}
                  <FormDialog trigger="Transfer" variant="secondary" size="sm" title="Transfer within the year" action={transferStudent.bind(null, current.id)} submitLabel="Record transfer">
                    <TransferFields grades={gradeOptions(grades.data ?? [])} sections={sectionOptions(sectionOpts)} gradeId={current.grade_level_id} />
                  </FormDialog>
                  <FormDialog trigger="Close enrollment" variant="secondary" size="sm" title="Close enrollment" action={closeEnrollment.bind(null, current.id)} submitLabel="Close enrollment">
                    <CloseEnrollmentFields />
                  </FormDialog>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">{year ? `Not enrolled in ${year.name}.` : "No current academic year is set."}</p>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Enrollment history" description="Every placement is kept; past years are never overwritten." />
        {rows.length === 0 ? (
          <EmptyState title="No enrollments yet" />
        ) : (
          <Table label="Enrollment history">
            <thead>
              <tr>
                <Th>Year</Th>
                <Th>Grade</Th>
                <Th>Section</Th>
                <Th>Status</Th>
                <Th>From</Th>
                <Th>To</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <Td className="font-medium">{e.academic_year.name}</Td>
                  <Td>{e.grade_level.name}</Td>
                  <Td>{e.section?.name ?? <span className="text-muted">—</span>}</Td>
                  <Td><StatusBadge status={e.enrollment_status} /></Td>
                  <Td className="text-muted">{d(e.enrollment_date)}</Td>
                  <Td className="text-muted">{d(e.exit_date) ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  )
}

async function Guardians({ student, isAdmin }: { student: Student; isAdmin: boolean }) {
  const { data: links } = await studentGuardians(student.id)
  return (
    <Card>
      <CardHeader
        title="Parents & guardians"
        action={
          isAdmin ? (
            <FormDialog trigger={<><Plus className="size-4" aria-hidden /> Add</>} size="sm" title="Link a parent or guardian" description="Search existing records. Create a new parent/guardian first if needed." action={linkGuardian} submitLabel="Link">
              <GuardianLinkFields studentId={student.id} />
            </FormDialog>
          ) : null
        }
      />
      {!links?.length ? (
        <EmptyState title="No parents or guardians linked" description={isAdmin ? "Link existing parent/guardian records, or create one under Parents & Guardians." : undefined} />
      ) : (
        <ul className="divide-y divide-border">
          {links.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
              <div>
                <p className="font-medium">
                  {isAdmin ? <Link href={`/guardians/${l.guardian.id}`} className="text-brand hover:underline">{l.guardian.first_name} {l.guardian.last_name}</Link> : `${l.guardian.first_name} ${l.guardian.last_name}`}
                  <span className="ml-2 text-muted">{label(l.relationship_type)}</span>
                </p>
                <p className="mt-1 flex flex-wrap gap-1">
                  {l.is_primary && <Badge tone="blue">Primary</Badge>}
                  {l.can_pickup && <Badge>Can pick up</Badge>}
                  {l.can_receive_notifications && <Badge>Notifications</Badge>}
                  {l.guardian.phone && <span className="text-muted">{l.guardian.phone}</span>}
                </p>
              </div>
              {isAdmin && (
                <div className="flex gap-2">
                  <FormDialog trigger="Edit" variant="secondary" size="sm" title="Edit relationship" action={updateGuardianLink.bind(null, l.id)}>
                    <GuardianLinkFields link={l} />
                  </FormDialog>
                  <ConfirmAction destructive trigger="Remove" title="Remove this guardian from the student?" description="The guardian record itself is kept." confirmLabel="Remove" onConfirm={unlinkGuardian.bind(null, l.id)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
