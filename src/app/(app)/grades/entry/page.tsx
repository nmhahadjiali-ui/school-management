import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { Card } from "@/components/ui/card"
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui/misc"
import { GradeSheet } from "@/components/academics/grade-sheet"
import { requireAcademicActor } from "@/lib/auth/session"
import { isUuid } from "@/lib/list-params"
import { createClient } from "@/lib/supabase/server"
import { getTeachingLoad, gradeSheet, listGradingScales } from "@/services/operations"
import { getSchoolSettings } from "@/services/settings"

export const metadata: Metadata = { title: "Enter grades" }

/** Grade entry for one of the teacher's own classes. Other teachers' classes are 404. */
export default async function GradeEntryPage({ searchParams }: PageProps<"/grades/entry">) {
  const actor = await requireAcademicActor("grades")
  if (actor.isAdmin) redirect("/grades/review")
  const sp = await searchParams
  if (!isUuid(typeof sp.load === "string" ? sp.load : undefined) || !isUuid(typeof sp.period === "string" ? sp.period : undefined)) notFound()

  const [{ data: load }, periodRes] = await Promise.all([
    getTeachingLoad(sp.load as string),
    (await createClient()).from("grading_periods").select("*").eq("id", sp.period as string).maybeSingle(),
  ])
  const period = periodRes.data
  // Must be the caller's own teaching load, and the period must be in the same year.
  if (!load || load.teacher_id !== actor.teacherId || !period || period.academic_year_id !== load.academic_year_id) notFound()

  const [sheet, settings, scales] = await Promise.all([
    gradeSheet(load.section_id, load.subject_id, period),
    getSchoolSettings(actor.schoolId),
    listGradingScales(actor.schoolId),
  ])

  return (
    <>
      <PageHeader
        eyebrow={`${period.name} · ${load.section.grade_level.name} – ${load.section.name}`}
        title={load.subject.name}
        description={<StatusBadge status={period.status} />}
      />
      <Card>
        {sheet.data.length === 0 ? (
          <EmptyState title="No students in this class during this period" />
        ) : (
          <GradeSheet
            loadId={load.id}
            periodId={period.id}
            open={period.status === "open"}
            maxScore={Number(settings.data?.grade_max_score ?? 100)}
            passingScore={Number(settings.data?.grade_passing_score ?? 75)}
            scales={(scales.data ?? []).map((s) => ({ name: s.name, minimum_score: Number(s.minimum_score), equivalent: s.equivalent, is_passing: s.is_passing }))}
            students={sheet.data.map((r) => ({
              enrollment_id: r.enrollment_id,
              name: `${r.student.last_name}, ${r.student.first_name}`,
              number: r.student.student_number,
              score: r.grade?.score ?? null,
              remarks: r.grade?.remarks ?? null,
              status: r.grade?.status ?? null,
            }))}
          />
        )}
      </Card>
    </>
  )
}
