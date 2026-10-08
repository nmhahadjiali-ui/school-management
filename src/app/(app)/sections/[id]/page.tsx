import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { Plus } from "lucide-react"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { ConfirmAction } from "@/components/ui/confirm-dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Badge, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/misc"
import { DescriptionList } from "@/components/data/list"
import { AssignmentFields, SectionFields } from "@/components/school/fields"
import { createAssignment, deleteAssignment, setSectionStatus, updateSection } from "@/lib/actions/academic"
import { requireActiveUser } from "@/lib/auth/session"
import { subjectOptions, teacherOptions } from "@/lib/options"
import { formatDate } from "@/lib/utils"
import { uuidSchema } from "@/lib/validations"
import { getSection, listActiveSubjects, sectionAssignments, sectionRoster } from "@/services/academic"
import { listActiveTeachers } from "@/services/people"

export const metadata: Metadata = { title: "Section" }

/** Section detail: school admins (manage) and the section's teachers (view). RLS decides visibility. */
export default async function SectionPage({ params }: PageProps<"/sections/[id]">) {
  const ctx = await requireActiveUser()
  const role = ctx.profile.role
  if (role !== "school_admin" && role !== "teacher") redirect("/dashboard?denied=1")
  const { id } = await params
  if (!uuidSchema.safeParse(id).success) notFound()

  const { data: section, error } = await getSection(id)
  if (error) throw new Error("Unable to load section")
  if (!section) notFound()

  const isAdmin = role === "school_admin"
  const editable = isAdmin && section.academic_year.status !== "archived"
  const [roster, assignments, teachers, subjects] = await Promise.all([
    sectionRoster(id),
    sectionAssignments(id),
    editable ? listActiveTeachers(section.school_id) : Promise.resolve({ data: [] }),
    editable ? listActiveSubjects(section.school_id) : Promise.resolve({ data: [] }),
  ])
  const students = roster.data ?? []

  return (
    <>
      <PageHeader
        eyebrow={`${section.academic_year.name} · ${section.grade_level.name}`}
        title={`${section.grade_level.name} – ${section.name}`}
        description={<StatusBadge status={section.status} />}
        actions={
          editable ? (
            <>
              <FormDialog trigger="Edit section" variant="secondary" title="Edit section" action={updateSection.bind(null, section.id)}>
                <SectionFields section={section} teachers={teacherOptions(teachers.data ?? [])} />
              </FormDialog>
              {section.status === "active" ? (
                <ConfirmAction destructive size="md" trigger="Deactivate" title="Deactivate this section?" description="It will no longer be offered for new enrollments. Current enrollments are kept." confirmLabel="Deactivate" onConfirm={setSectionStatus.bind(null, section.id, "inactive")} />
              ) : (
                <ConfirmAction size="md" trigger="Reactivate" title="Reactivate this section?" description="It will accept enrollments again." confirmLabel="Reactivate" onConfirm={setSectionStatus.bind(null, section.id, "active")} />
              )}
            </>
          ) : null
        }
      />
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader title="Students" description={`${students.length} enrolled${section.capacity ? ` of ${section.capacity}` : ""}`} />
          {students.length === 0 ? (
            <EmptyState title="No students enrolled" description={isAdmin ? "Enroll students from the Enrollments page or a student's profile." : undefined} />
          ) : (
            <Table label="Students in this section">
              <thead>
                <tr>
                  <Th>Student</Th>
                  <Th>Student no.</Th>
                  <Th>Enrolled</Th>
                </tr>
              </thead>
              <tbody>
                {students.map((e) => (
                  <tr key={e.id}>
                    <Td>
                      <Link href={`/students/${e.student.id}`} className="font-medium text-brand hover:underline">
                        {e.student.last_name}, {e.student.first_name}
                      </Link>
                    </Td>
                    <Td className="font-mono text-xs">{e.student.student_number}</Td>
                    <Td className="text-muted">{formatDate(e.enrollment_date, "UTC")}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DescriptionList
                items={[
                  ["Academic year", section.academic_year.name],
                  ["Grade level", section.grade_level.name],
                  ["Code", section.code],
                  ["Adviser", section.adviser ? `${section.adviser.first_name} ${section.adviser.last_name}` : null],
                  ["Room", section.room],
                  ["Capacity", section.capacity ?? "No limit"],
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title="Subject teachers"
              action={
                editable ? (
                  <FormDialog trigger={<><Plus className="size-4" aria-hidden /> Assign</>} size="sm" title="Assign a subject teacher" action={createAssignment} submitLabel="Assign">
                    <AssignmentFields yearId={section.academic_year_id} sectionId={section.id} teachers={teacherOptions(teachers.data ?? [])} subjects={subjectOptions(subjects.data ?? [])} />
                  </FormDialog>
                ) : null
              }
            />
            {!assignments.data?.length ? (
              <EmptyState title="No subject teachers yet" />
            ) : (
              <ul className="divide-y divide-border">
                {assignments.data.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <div>
                      <p className="font-medium">{a.subject.name} <Badge>{a.subject.code}</Badge></p>
                      <p className="text-muted">{a.teacher.first_name} {a.teacher.last_name}</p>
                    </div>
                    {editable && (
                      <ConfirmAction destructive trigger="Remove" title="Remove this assignment?" description={`${a.teacher.first_name} ${a.teacher.last_name} will no longer teach ${a.subject.name} in this section.`} confirmLabel="Remove" onConfirm={deleteAssignment.bind(null, a.id)} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
