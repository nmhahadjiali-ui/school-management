import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/misc"
import { DescriptionList } from "@/components/data/list"
import { requireAcademicActor } from "@/lib/auth/session"
import { formatDateTime } from "@/lib/dates"
import { createClient } from "@/lib/supabase/server"
import { uuidSchema } from "@/lib/validations"
import { gradeHistory } from "@/services/operations"

export const metadata: Metadata = { title: "Grade history" }

/** Who changed this grade, when, from what, and why. Admins and the grade's teacher (RLS). */
export default async function GradeHistoryPage({ params }: PageProps<"/grades/[id]">) {
  const actor = await requireAcademicActor("grades")
  const { id } = await params
  if (!uuidSchema.safeParse(id).success) notFound()
  const supabase = await createClient()
  const { data: grade } = await supabase
    .from("grade_records")
    .select(`id, score, remarks, status, submitted_at, approved_at, locked_at,
      student:students!grade_records_student_ref(first_name, last_name, student_number),
      subject:subjects!grade_records_subject_ref(name),
      section:sections!grade_records_section_ref(name, grade_level:grade_levels!sections_grade_level_fkey(name)),
      teacher:teachers!grade_records_teacher_ref(first_name, last_name),
      period:grading_periods!grade_records_period_fkey(name)`)
    .eq("id", id)
    .maybeSingle()
  if (!grade) notFound()
  const { data: history } = await gradeHistory(id)

  // Resolve who made each change (profiles visible to the admin; teachers see names they can see).
  const actors = [...new Set((history ?? []).map((h) => h.changed_by).filter(Boolean))] as string[]
  const { data: people } = actors.length ? await supabase.from("profiles").select("user_id, first_name, last_name, role").in("user_id", actors) : { data: [] }
  const who = (uid: string | null) => {
    const p = (people ?? []).find((x) => x.user_id === uid)
    return p ? `${p.first_name} ${p.last_name}`.trim() || p.role : uid === null ? "System" : actor.isAdmin ? "Unknown user" : "School staff"
  }

  return (
    <>
      <PageHeader
        eyebrow={`${grade.period.name} · ${grade.subject.name}`}
        title={`${grade.student.first_name} ${grade.student.last_name}`}
        description={<StatusBadge status={grade.status} />}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_2fr]">
        <Card className="self-start">
          <CardHeader title="Current grade" />
          <CardBody>
            <DescriptionList
              items={[
                ["Score", <span key="s" className="text-lg font-semibold tabular-nums">{Number(grade.score)}</span>],
                ["Remarks", grade.remarks],
                ["Class", `${grade.section.grade_level.name} – ${grade.section.name}`],
                ["Teacher", `${grade.teacher.first_name} ${grade.teacher.last_name}`],
                ["Submitted", grade.submitted_at ? formatDateTime(grade.submitted_at) : null],
                ["Approved", grade.approved_at ? formatDateTime(grade.approved_at) : null],
                ["Locked", grade.locked_at ? formatDateTime(grade.locked_at) : null],
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Change history" description="Every creation, score change and status change. History cannot be edited or deleted." />
          {!history?.length ? (
            <EmptyState title="No history" />
          ) : (
            <Table label="Grade history">
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Who</Th>
                  <Th>Score</Th>
                  <Th>Status</Th>
                  <Th>Reason</Th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <Td className="whitespace-nowrap text-muted">{formatDateTime(h.changed_at, actor.school?.timezone)}</Td>
                    <Td>{who(h.changed_by)}</Td>
                    <Td className="tabular-nums">{h.old_score !== null && Number(h.old_score) !== Number(h.new_score) ? <><s className="text-muted">{Number(h.old_score)}</s> → {Number(h.new_score)}</> : Number(h.new_score)}</Td>
                    <Td>{h.old_status && h.old_status !== h.new_status ? <>{h.old_status} → <StatusBadge status={h.new_status ?? ""} /></> : <StatusBadge status={h.new_status ?? ""} />}</Td>
                    <Td className="text-muted">{h.reason}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  )
}
