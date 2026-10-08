import Link from "next/link"
import { Card, CardHeader } from "@/components/ui/card"
import { Badge, EmptyState, StatCard } from "@/components/ui/misc"
import { formatDateTime, formatTime, isoWeekday, todayIn } from "@/lib/dates"
import { createClient } from "@/lib/supabase/server"
import { getUserId } from "@/lib/auth/session"
import { myTeachingSections } from "@/services/academic"
import { listSchedules, recentActivity, teachingLoads, upcomingCoursework } from "@/services/operations"
import type { UserContext } from "@/types/domain"

const ACTIVITY: Record<string, string> = {
  "attendance.created": "Took attendance",
  "attendance.modified": "Changed an attendance record",
  "grade.created": "Entered a grade",
  "grade.modified": "Changed a grade",
  "grade.submitted": "Submitted a grade",
  "assignment.created": "Created an assignment",
  "assignment.modified": "Updated an assignment",
}

/** Everything is scoped to the teacher's own classes by RLS. */
export async function TeacherDashboard({ ctx, teacherId, yearId }: { ctx: UserContext; teacherId: string; yearId: string }) {
  const on = (f: string) => ctx.features.includes(f)
  const today = todayIn(ctx.school?.timezone)
  const supabase = await createClient()
  const [sections, loads, todaysClasses, upcoming, activity] = await Promise.all([
    myTeachingSections(teacherId, yearId),
    teachingLoads(ctx.profile.school_id!, yearId, teacherId),
    on("schedules") ? listSchedules({ yearId, teacherId, day: isoWeekday(today) }) : null,
    on("coursework") ? upcomingCoursework({ teacherId }, 14, 6) : null,
    getUserId().then((uid) => recentActivity(uid ?? "", 6)),
  ])
  const sectionIds = sections.data.map((s) => s.id)
  const { data: taken } = on("attendance") && sectionIds.length
    ? await supabase.from("attendance_sessions").select("section_id").in("section_id", sectionIds).eq("attendance_date", today).eq("session_type", "daily")
    : { data: [] as { section_id: string }[] }
  const takenSet = new Set((taken ?? []).map((t) => t.section_id))
  const subjects = [...new Set(loads.data.map((l) => l.subject.name))].sort()

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="My sections" value={sections.data.length} />
        <StatCard label="My subjects" value={subjects.length} hint={subjects.join(", ") || undefined} />
        {on("schedules") && <StatCard label="Classes today" value={todaysClasses?.data.length ?? 0} />}
        {on("attendance") && <StatCard label="Attendance to take today" value={sections.data.filter((s) => !takenSet.has(s.id)).length} hint={`${takenSet.size} of ${sections.data.length} done`} />}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {todaysClasses && (
          <Card>
            <CardHeader title="Today's schedule" action={<Link href="/schedule" className="text-sm font-medium text-brand hover:underline">Full week</Link>} />
            {todaysClasses.data.length === 0 ? (
              <EmptyState title="No classes today" />
            ) : (
              <ul className="divide-y divide-border">
                {todaysClasses.data.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="w-36 shrink-0 tabular-nums text-muted">{formatTime(c.start_time)} – {formatTime(c.end_time)}</span>
                    <span className="flex-1 font-medium">{c.subject.name}</span>
                    <span className="text-muted">{c.section.grade_level.name} – {c.section.name}{c.room ? ` · ${c.room}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        {on("attendance") && (
          <Card>
            <CardHeader title="Today's attendance" action={<Link href="/attendance" className="text-sm font-medium text-brand hover:underline">Take attendance</Link>} />
            {sections.data.length === 0 ? (
              <EmptyState title="No sections assigned" />
            ) : (
              <ul className="divide-y divide-border">
                {sections.data.map((s) => (
                  <li key={s.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <Link href={`/attendance?section=${s.id}`} className="font-medium text-brand hover:underline">{s.grade_level.name} – {s.name}</Link>
                    {takenSet.has(s.id) ? <Badge tone="green">Taken</Badge> : <Badge tone="amber">Not yet</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        {upcoming && (
          <Card>
            <CardHeader title="Upcoming assignments" action={<Link href="/coursework/new" className="text-sm font-medium text-brand hover:underline">New</Link>} />
            {upcoming.data.length === 0 ? (
              <EmptyState title="Nothing due in the next two weeks" />
            ) : (
              <ul className="divide-y divide-border">
                {upcoming.data.map((w) => (
                  <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                    <Link href={`/coursework/${w.id}`} className="font-medium text-brand hover:underline">{w.title}</Link>
                    <span className="text-muted">{w.section.grade_level.name} – {w.section.name} · {formatDateTime(w.due_at, ctx.school?.timezone)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        <Card>
          <CardHeader title="Recent activity" />
          {!activity.data?.length ? (
            <EmptyState title="No recent activity" />
          ) : (
            <ul className="divide-y divide-border">
              {activity.data.map((a) => (
                <li key={a.id} className="flex justify-between gap-3 px-5 py-2.5 text-sm">
                  <span>{ACTIVITY[a.action] ?? a.action}{typeof (a.metadata as Record<string, unknown>)?.title === "string" ? `: ${(a.metadata as Record<string, string>).title}` : ""}</span>
                  <span className="shrink-0 text-muted">{formatDateTime(a.created_at, ctx.school?.timezone)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
