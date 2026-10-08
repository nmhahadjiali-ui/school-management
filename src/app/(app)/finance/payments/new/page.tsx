import type { Metadata } from "next"
import { Alert } from "@/components/ui/alert"
import { Card, CardBody } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/misc"
import { PaymentEntry } from "@/components/finance/payment-entry"
import { requireFinance } from "@/lib/finance/access"
import { todayIn } from "@/lib/dates"
import { isUuid } from "@/lib/list-params"
import { getStudentRef, openCharges } from "@/services/finance"

export const metadata: Metadata = { title: "Record payment" }

export default async function NewPaymentPage({ searchParams }: PageProps<"/finance/payments/new">) {
  const ctx = await requireFinance("staff")
  const { student: studentParam } = await searchParams
  const studentId = typeof studentParam === "string" && isUuid(studentParam) ? studentParam : null
  // RLS: only students of the user's own school are found.
  const { data: student } = studentId ? await getStudentRef(studentId) : { data: null }
  const { data: charges } = student ? await openCharges(student.id) : { data: [] }

  return (
    <>
      <PageHeader eyebrow="Finance" title="Record payment" description="For money received at the school (cash, bank transfer, check…). Online payments are recorded automatically when the provider confirms them." />
      {studentId && !student && <Alert tone="error" className="mb-4">That student was not found.</Alert>}
      <Card>
        <CardBody>
          <PaymentEntry
            key={student?.id ?? "none"}
            student={student ? { id: student.id, label: `${student.last_name}, ${student.first_name}`, detail: student.student_number } : null}
            charges={(charges ?? []).map((c) => ({ id: c.id!, description: c.description ?? "", due_date: c.due_date, remaining: Number(c.remaining), effective_status: c.effective_status ?? "pending" }))}
            currency={ctx.currency}
            today={todayIn(ctx.school?.timezone ?? "UTC")}
          />
        </CardBody>
      </Card>
    </>
  )
}
