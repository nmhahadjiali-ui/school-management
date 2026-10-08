import type { Metadata } from "next"
import { Suspense } from "react"
import { Alert } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/misc"
import { TableSkeleton } from "@/components/data/list"
import { ChildrenList } from "@/components/school/children-list"
import { requirePermission } from "@/lib/auth/session"

export const metadata: Metadata = { title: "My children" }

export default async function MyChildrenPage() {
  const ctx = await requirePermission("parent.children")
  const guardianId = ctx.record?.type === "guardian" ? ctx.record.id : null
  return (
    <>
      <PageHeader title="My children" description="Students linked to your account by the school." />
      {!guardianId ? (
        <Alert tone="info">Your account is not linked to a parent/guardian record yet. Please contact your school administrator.</Alert>
      ) : (
        <Card>
          <Suspense fallback={<TableSkeleton rows={2} />}>
            <ChildrenList guardianId={guardianId} />
          </Suspense>
        </Card>
      )}
    </>
  )
}
