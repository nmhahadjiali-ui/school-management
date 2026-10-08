import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/misc"
import { OnlinePay } from "@/components/finance/online-pay"
import { StudentFinance } from "@/components/finance/student-finance"
import { requireFamilyFinance } from "@/lib/finance/access"
import { isUuid } from "@/lib/list-params"
import { defaultPaymentProvider } from "@/server/payments/providers"
import { getStudentRef, openCharges } from "@/services/finance"

export const metadata: Metadata = { title: "Student account" }

/**
 * A student's account as the student or a verified parent sees it. RLS makes
 * any other student "not found" (a parent cannot open an unrelated child).
 */
export default async function FamilyAccountPage({ params }: PageProps<"/fees/[studentId]">) {
  const ctx = await requireFamilyFinance()
  const { studentId } = await params
  if (!isUuid(studentId)) notFound()
  const { data: student } = await getStudentRef(studentId)
  if (!student) notFound()
  const online = ctx.features.includes("online_payments") && defaultPaymentProvider() !== null
  const { data: open } = online ? await openCharges(studentId) : { data: [] }

  return (
    <>
      <PageHeader eyebrow={student.student_number} title={`${student.first_name} ${student.last_name}`} description="Charges, payments and the full statement of account." />
      <StudentFinance
        studentId={studentId}
        currency={ctx.currency}
        actions={
          online && (open ?? []).length > 0 ? (
            <Card>
              <CardHeader title="Pay online" description="Select the charges to pay." />
              <CardBody>
                <OnlinePay studentId={studentId} currency={ctx.currency} charges={(open ?? []).map((c) => ({ id: c.id!, description: c.description ?? "", due_date: c.due_date, remaining: Number(c.remaining) }))} />
              </CardBody>
            </Card>
          ) : null
        }
      />
    </>
  )
}
