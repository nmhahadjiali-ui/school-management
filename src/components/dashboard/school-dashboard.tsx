import { GraduationCap } from "lucide-react"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { PageHeader, RoleBadge, StatCard } from "@/components/ui/misc"
import { getSchoolStats } from "@/services/stats"
import { fullName } from "@/lib/utils"
import type { UserContext } from "@/types/domain"

export async function SchoolDashboard({ ctx }: { ctx: UserContext }) {
  const { profile, school, current_academic_year: year } = ctx
  const stats = await getSchoolStats(school!.id, year?.id ?? null)

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
