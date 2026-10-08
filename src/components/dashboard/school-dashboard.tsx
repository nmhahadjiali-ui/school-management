import { GraduationCap } from "lucide-react"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { PageHeader, RoleBadge, StatCard } from "@/components/ui/misc"
import Link from "next/link"
import { getSchoolStats } from "@/services/stats"
import { formatDateTime, todayIn } from "@/lib/dates"
import { attendanceDayTotals, pendingGradeCount, schoolActivity, upcomingCount } from "@/services/operations"
import { EmptyState } from "@/components/ui/misc"
import { fullName } from "@/lib/utils"
import type { UserContext } from "@/types/domain"

export async function SchoolDashboard({ ctx }: { ctx: UserContext }) {
  const { profile, school, current_academic_year: year } = ctx
  const on = (f: string) => ctx.features.includes(f)
  const today = todayIn(school?.timezone)
  const [stats, attendance, pending, upcoming, activity] = await Promise.all([
    getSchoolStats(school!.id, year?.id ?? null),
    on("attendance") ? attendanceDayTotals(school!.id, today) : null,
    on("grades") ? pendingGradeCount(school!.id) : null,
    on("coursework") ? upcomingCount(school!.id, 7) : null,
    schoolActivity(school!.id, 8),
  ])
  const marked = attendance ? attendance.data.present + attendance.data.absent + attendance.data.late + attendance.data.excused : 0
  const presentRate = attendance && marked ? Math.round(((attendance.data.present + attendance.data.late) / marked) * 100) : null

  return (
    <>
      <div className="mb-6 flex items-center gap-4">
        {school?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary school-provided URL
          <img src={school.logo_url} alt={`${school.name} logo`} className="size-14 rounded-lg border border-border bg-surface object-contain" />
        ) : (
          <span className="flex size-14 items-center justify-center rounded-lg bg-brand text-white">
            <GraduationCap className="size-7" aria-hidden />
          </span>
        )}
        <PageHeader
          eyebrow={school?.code}
          title={school?.name ?? "School"}
          description={year ? `Academic year ${year.name}` : "No current academic year set"}
        />
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total students" value={stats.students} hint={year ? `Enrolled in ${year.name}` : "Active student records"} />
        <StatCard label="Total teachers" value={stats.teachers} hint="Active teachers" />
        <StatCard label="Total parents" value={stats.parents} hint="Active parents & guardians" />
        <StatCard label="Total classes" value={stats.classes} hint={year ? `Active sections in ${year.name}` : "Set a current academic year"} />
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-3">
        {attendance && (
          <Card>
            <CardHeader title="Today's attendance" action={<Link href="/attendance/reports?view=date" className="text-sm font-medium text-brand hover:underline">Details</Link>} />
            <CardBody className="space-y-1 text-sm">
              <p className="text-3xl font-semibold tabular-nums">{presentRate === null ? "—" : `${presentRate}%`}</p>
              <p className="text-muted">
                {attendance.data.sessions} of {stats.classes ?? "?"} sections recorded · {attendance.data.absent} absent · {attendance.data.late} late
              </p>
            </CardBody>
          </Card>
        )}
        {pending !== null && (
          <Card>
            <CardHeader title="Pending grade submissions" action={<Link href="/grades/review" className="text-sm font-medium text-brand hover:underline">Review</Link>} />
            <CardBody>
              <p className="text-3xl font-semibold tabular-nums">{pending}</p>
              <p className="text-sm text-muted">Submitted by teachers, awaiting approval</p>
            </CardBody>
          </Card>
        )}
        {upcoming !== null && (
          <Card>
            <CardHeader title="Upcoming assignments" action={<Link href="/coursework" className="text-sm font-medium text-brand hover:underline">View</Link>} />
            <CardBody>
              <p className="text-3xl font-semibold tabular-nums">{upcoming}</p>
              <p className="text-sm text-muted">Due in the next 7 days</p>
            </CardBody>
          </Card>
        )}
      </div>

      <Card className="mb-8">
        <CardHeader title="Recent academic activity" description="From the audit log" />
        {!activity.data?.length ? (
          <EmptyState title="No activity yet" />
        ) : (
          <ul className="divide-y divide-border">
            {activity.data.map((a) => (
              <li key={a.id} className="flex justify-between gap-3 px-5 py-2.5 text-sm">
                <span className="font-mono text-xs">{a.action}</span>
                <span className="text-muted">{formatDateTime(a.created_at, school?.timezone)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="max-w-xl">
        <CardHeader title="Signed in as" />
        <CardBody className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium">{fullName(profile)}</p>
            <p className="text-sm text-muted">{profile.email}</p>
          </div>
          <RoleBadge role={profile.role} />
        </CardBody>
      </Card>
    </>
  )
}
