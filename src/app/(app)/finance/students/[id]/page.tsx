import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Plus } from "lucide-react"
import { LinkButton } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/misc"
import { NewChargeDialog } from "@/components/finance/finance-actions"
import { StudentFinance } from "@/components/finance/student-finance"
import { atLeast, requireFinance } from "@/lib/finance/access"
import { isUuid } from "@/lib/list-params"
import { getStudentRef, listDiscountTypes, listFeeTypes } from "@/services/finance"

export const metadata: Metadata = { title: "Student account" }

export default async function StudentAccountPage({ params }: PageProps<"/finance/students/[id]">) {
  const ctx = await requireFinance("view")
  const { id } = await params
  if (!isUuid(id)) notFound()
  const { data: student } = await getStudentRef(id)
  if (!student) notFound()
  const isAdmin = atLeast(ctx.level, "admin")
  const [{ data: feeTypes }, { data: discountTypes }] = isAdmin
    ? await Promise.all([listFeeTypes(ctx.schoolId), listDiscountTypes(ctx.schoolId, true)])
    : [{ data: [] }, { data: [] }]
  const activeFeeTypes = (feeTypes ?? []).filter((t) => t.status === "active")
  const label = `${student.last_name}, ${student.first_name}`

  return (
    <>
      <PageHeader
        eyebrow={`Student account · ${student.student_number}`}
        title={label}
        actions={
          <div className="flex flex-wrap gap-2">
            {isAdmin && activeFeeTypes.length > 0 && <NewChargeDialog feeTypes={activeFeeTypes.map((t) => ({ value: t.id, label: t.name }))} student={{ id, label }} />}
            {atLeast(ctx.level, "staff") && <LinkButton href={`/finance/payments/new?student=${id}`}><Plus className="size-4" aria-hidden /> Record payment</LinkButton>}
          </div>
        }
      />
      <StudentFinance
        studentId={id}
        currency={ctx.currency}
        chargeHref={(c) => `/finance/charges/${c}`}
        paymentHref={(p) => `/finance/payments/${p}`}
        discounts={isAdmin ? {
          types: (discountTypes ?? []).map((d) => ({ id: d.id, name: d.name, calculation_type: d.calculation_type as "fixed" | "percentage", value: Number(d.value) })),
          // Tuition by category, including fee types that were deactivated after billing.
          tuitionTypeIds: (feeTypes ?? []).filter((t) => t.category === "tuition").map((t) => t.id),
        } : undefined}
      />
    </>
  )
}
