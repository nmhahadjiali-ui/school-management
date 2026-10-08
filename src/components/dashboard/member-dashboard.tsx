import Link from "next/link"
import { Suspense } from "react"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { EmptyState, PageHeader, RoleBadge } from "@/components/ui/misc"
import { TableSkeleton } from "@/components/data/list"
import { ChildrenList } from "@/components/school/children-list"
import { MyClasses } from "@/components/school/my-classes"
import { FEATURE_LABELS } from "@/lib/features"
import { fullName } from "@/lib/utils"
import { studentEnrollments } from "@/services/academic"
import type { UserContext } from "@/types/domain"

/** Teacher / student / parent dashboard. */
export function MemberDashboard({ ctx }: { ctx: UserContext }) {
  const { profile, school, features, record, current_academic_year: year } = ctx
  const recordHref = record ? `/${record.type === "guardian" ? "guardians" : `${record.type}s`}/${record.id}` : null

  return (
    <>
      <PageHeader eyebrow={school?.name} title={`Welcome, ${profile.first_name || fullName(profile)}`} description={year ? `Academic year ${year.name}` : undefined} />
      <div className="space-y-6">
        {record?.type === "teacher" && year && (
          <Card>
            <CardHeader title="My classes" action={<Link href="/my-classes" className="text-sm font-medium text-brand hover:underline">View all</Link>} />
            <Suspense fallback={<TableSkeleton rows={2} />}>
              <MyClasses teacherId={record.id} yearId={year.id} />
            </Suspense>
          </Card>
        )}
        {record?.type === "guardian" && (
          <Card>
            <CardHeader title="My children" />
            <Suspense fallback={<TableSkeleton rows={2} />}>
              <ChildrenList guardianId={record.id} />
            </Suspense>
          </Card>
        )}
        {record?.type === "student" && (
          <Suspense fallback={<Card><TableSkeleton rows={2} /></Card>}>
            <StudentPlacement studentId={record.id} yearId={year?.id ?? null} />
          </Suspense>
        )}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Your account" />
            <CardBody>
              <dl className="grid grid-cols-[8rem_1fr] gap-y-3 text-sm">
                <dt className="text-muted">Name</dt>
                <dd className="font-medium">{fullName(profile)}</dd>
                <dt className="text-muted">Email</dt>
                <dd>{profile.email}</dd>
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
          <Card>
            <CardHeader title="Available modules" description="Modules enabled for your school." />
            {features.length === 0 ? (
              <EmptyState title="No modules yet" description="Your school's modules will appear here as they become available." />
            ) : (
              <ul className="divide-y divide-border">
                {features.map((key) => (
                  <li key={key}>
                    <Link href={`/modules/${key}`} className="block px-5 py-3 text-sm font-medium hover:bg-slate-50">{FEATURE_LABELS[key] ?? key}</Link>
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

async function StudentPlacement({ studentId, yearId }: { studentId: string; yearId: string | null }) {
  const { data } = await studentEnrollments(studentId)
  const current = (data ?? []).find((e) => e.enrollment_status === "enrolled" && e.academic_year_id === yearId)
  return (
    <Card>
      <CardHeader title="My class" />
      <CardBody className="text-sm">
        {current ? (
          <p>
            <span className="font-medium">{current.grade_level.name}{current.section ? ` – ${current.section.name}` : ""}</span>
            <span className="text-muted"> · {current.academic_year.name}</span>
          </p>
        ) : (
          <p className="text-muted">You are not enrolled in the current academic year.</p>
        )}
      </CardBody>
    </Card>
  )
}
