import Link from "next/link"
import { Suspense } from "react"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { EmptyState, PageHeader, RoleBadge } from "@/components/ui/misc"
import { TableSkeleton } from "@/components/data/list"
import { ChildrenList } from "@/components/school/children-list"
import { StudentAcademics } from "@/components/academics/student-academics"
import { TeacherDashboard } from "@/components/dashboard/teacher-dashboard"
import { AnnouncementsCard } from "@/components/dashboard/announcements-card"
import { FEATURE_LABELS } from "@/lib/features"
import { formatDateTime } from "@/lib/dates"
import { fullName } from "@/lib/utils"
import { studentEnrollments } from "@/services/academic"
import { myNotifications } from "@/services/operations"
import type { UserContext } from "@/types/domain"

const CORE = new Set(["schedules", "attendance", "grades", "coursework", "notifications"])

/** Teacher / student / parent dashboard. All data is scoped by RLS to the viewer. */
export function MemberDashboard({ ctx }: { ctx: UserContext }) {
  const { profile, school, features, record, current_academic_year: year } = ctx
  const recordHref = record ? `/${record.type === "guardian" ? "guardians" : `${record.type}s`}/${record.id}` : null
  const modules = features.filter((f) => !CORE.has(f))
  const skeleton = <Card><TableSkeleton rows={3} /></Card>

  return (
    <>
      <PageHeader eyebrow={school?.name} title={`Welcome, ${profile.first_name || fullName(profile)}`} description={year ? `Academic year ${year.name}` : undefined} />
      <div className="space-y-6">
        {record?.type === "teacher" && year && (
          <Suspense fallback={skeleton}>
            <TeacherDashboard ctx={ctx} teacherId={record.id} yearId={year.id} />
          </Suspense>
        )}
        {record?.type === "student" && (
          <Suspense fallback={skeleton}>
            <StudentPlacement studentId={record.id} yearId={year?.id ?? null} />
            <StudentAcademics student={{ id: record.id, school_id: profile.school_id!, first_name: profile.first_name }} ctx={ctx} />
          </Suspense>
        )}
        {record?.type === "guardian" && (
          <Card>
            <CardHeader title="My children" description="Open a child to see their schedule, attendance, grades and assignments." />
            <Suspense fallback={<TableSkeleton rows={2} />}>
              <ChildrenList guardianId={record.id} />
            </Suspense>
          </Card>
        )}
        <div className="grid gap-6 lg:grid-cols-2">
          {features.includes("announcements") && profile.school_id && (
            <Suspense fallback={skeleton}>
              <AnnouncementsCard schoolId={profile.school_id} timezone={school?.timezone} />
            </Suspense>
          )}
          {features.includes("notifications") && record?.type !== "teacher" && (
            <Suspense fallback={skeleton}>
              <RecentNotifications timezone={school?.timezone} />
            </Suspense>
          )}
          <Card>
            <CardHeader title="Your account" />
            <CardBody>
              <dl className="grid grid-cols-[8rem_1fr] gap-y-3 text-sm">
                <dt className="text-muted">Name</dt>
                <dd className="font-medium">{fullName(profile)}</dd>
                <dt className="text-muted">Role</dt>
                <dd><RoleBadge role={profile.role} /></dd>
                <dt className="text-muted">School</dt>
                <dd>{school?.name}</dd>
              </dl>
              {!record && <p className="mt-4 text-sm text-muted">Your account is not linked to a school record yet. Contact your school administrator.</p>}
              <div className="mt-4 flex gap-4 text-sm font-medium">
                <Link href="/profile" className="text-brand hover:underline">Edit profile</Link>
                {recordHref && <Link href={recordHref} className="text-brand hover:underline">View school record</Link>}
              </div>
            </CardBody>
          </Card>
          {modules.length > 0 && (
            <Card>
              <CardHeader title="Other modules" description="Optional modules enabled for your school." />
              <ul className="divide-y divide-border">
                {modules.map((key) => (
                  <li key={key}>
                    <Link href={`/modules/${key}`} className="block px-5 py-3 text-sm font-medium hover:bg-slate-50">{FEATURE_LABELS[key] ?? key}</Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}

async function RecentNotifications({ timezone }: { timezone?: string }) {
  const { data } = await myNotifications(5)
  return (
    <Card>
      <CardHeader title="Recent notifications" action={<Link href="/notifications" className="text-sm font-medium text-brand hover:underline">View all</Link>} />
      {!data?.length ? (
        <EmptyState title="No notifications yet" />
      ) : (
        <ul className="divide-y divide-border">
          {data.map((n) => (
            <li key={n.id} className="px-5 py-3 text-sm">
              <p className={n.read_at ? "" : "font-semibold"}>{n.title}</p>
              <p className="text-muted">{n.message}</p>
              <p className="text-xs text-muted">{formatDateTime(n.created_at, timezone)}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

async function StudentPlacement({ studentId, yearId }: { studentId: string; yearId: string | null }) {
  const { data } = await studentEnrollments(studentId)
  const current = (data ?? []).find((e) => e.enrollment_status === "enrolled" && e.academic_year_id === yearId)
  return (
    <Card className="mb-6">
      <CardBody className="text-sm">
        {current ? (
          <p>
            My class: <span className="font-medium">{current.grade_level.name}{current.section ? ` – ${current.section.name}` : ""}</span>
            <span className="text-muted"> · {current.academic_year.name}</span>
          </p>
        ) : (
          <p className="text-muted">You are not enrolled in the current academic year.</p>
        )}
      </CardBody>
    </Card>
  )
}
