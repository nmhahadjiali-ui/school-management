import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Alert } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/misc"
import { Timetable } from "@/components/academics/timetable"
import { requireActiveUser } from "@/lib/auth/session"
import { isoWeekday, todayIn } from "@/lib/dates"
import { studentEnrollments } from "@/services/academic"
import { listSchedules } from "@/services/operations"

export const metadata: Metadata = { title: "My schedule" }

/** Teacher: classes they teach. Student: their section's timetable. */
export default async function MySchedulePage() {
  const ctx = await requireActiveUser()
  const year = ctx.current_academic_year
  const role = ctx.profile.role
  if ((role !== "teacher" && role !== "student") || !ctx.features.includes("schedules")) redirect("/dashboard?denied=1")
  const today = isoWeekday(todayIn(ctx.school?.timezone))

  if (!year || !ctx.record) {
    return (
      <>
        <PageHeader title="My schedule" />
        <Alert tone="info">{!year ? "Your school has not set a current academic year." : "Your account is not linked to a school record yet."}</Alert>
      </>
    )
  }

  let rows: Awaited<ReturnType<typeof listSchedules>>["data"] = []
  let subtitle = year.name
  if (ctx.record.type === "teacher") {
    rows = (await listSchedules({ yearId: year.id, teacherId: ctx.record.id })).data
  } else {
    const { data: enrollments } = await studentEnrollments(ctx.record.id)
    const current = (enrollments ?? []).find((e) => e.enrollment_status === "enrolled" && e.academic_year_id === year.id)
    if (current?.section) {
      rows = (await listSchedules({ yearId: year.id, sectionId: current.section.id })).data
      subtitle = `${current.grade_level.name} – ${current.section.name} · ${year.name}`
    }
  }

  return (
    <>
      <PageHeader title="My schedule" description={subtitle} />
      <Card>
        <Timetable rows={rows} show={ctx.record.type === "teacher" ? "section" : "teacher"} highlightDay={today} />
      </Card>
    </>
  )
}
