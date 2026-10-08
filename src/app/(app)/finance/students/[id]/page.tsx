import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Plus } from "lucide-react"
import { LinkButton } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/misc"
import { NewChargeDialog } from "@/components/finance/finance-actions"
import { StudentFinance } from "@/components/finance/student-finance"
import { atLeast, requireFinance } from "@/lib/finance/access"
import { isUuid } from "@/lib/list-params"
import { getStudentRef, listFeeTypes } from "@/services/finance"

export const metadata: Metadata = { title: "Student account" }

export default async function StudentAccountPage({ params }: PageProps<"/finance/students/[id]">) {
  const ctx = await requireFinance("view")
  const { id } = await params
  if (!isUuid(id)) notFound()
  const { data: student } = await getStudentRef(id)
  if (!student) notFound()
  const { data: feeTypes } = atLeast(ctx.level, "admin") ? await listFeeTypes(ctx.schoolId, true) : { data: [] }
  const label = `${student.last_name}, ${student.first_name}`

  return (
    <>
      <PageHeader
        eyebrow={`Student account · ${student.student_number}`}
        title={label}
        actions={
          <div className="flex flex-wrap gap-2">
            {atLeast(ctx.level, "admin") && (feeTypes ?? []).length > 0 && <NewChargeDialog feeTypes={(feeTypes ?? []).map((t) => ({ value: t.id, label: t.name }))} student={{ id, label }} />}
            {atLeast(ctx.level, "staff") && <LinkButton href={`/finance/payments/new?student=${id}`}><Plus className="size-4" aria-hidden /> Record payment</LinkButton>}
          </div>
        }
      />
      <StudentFinance studentId={id} currency={ctx.currency} chargeHref={(c) => `/finance/charges/${c}`} paymentHref={(p) => `/finance/payments/${p}`} />
    </>
  )
}
