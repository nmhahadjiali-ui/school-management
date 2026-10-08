import type { Metadata } from "next"
import { Suspense } from "react"
import { Alert } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/misc"
import { TableSkeleton } from "@/components/data/list"
import { MyClasses } from "@/components/school/my-classes"
import { requirePermission } from "@/lib/auth/session"

export const metadata: Metadata = { title: "My classes" }

export default async function MyClassesPage() {
  const ctx = await requirePermission("teacher.classes")
  const year = ctx.current_academic_year
  const teacherId = ctx.record?.type === "teacher" ? ctx.record.id : null

  return (
    <>
      <PageHeader title="My classes" description={year ? `Sections you advise or teach in ${year.name}.` : undefined} />
      {!teacherId ? (
        <Alert tone="info">Your account is not linked to a teacher record yet. Please contact your school administrator.</Alert>
      ) : !year ? (
        <Alert tone="info">Your school has not set a current academic year.</Alert>
      ) : (
        <Card>
          <Suspense fallback={<TableSkeleton rows={3} />}>
            <MyClasses teacherId={teacherId} yearId={year.id} />
          </Suspense>
        </Card>
      )}
    </>
  )
}
