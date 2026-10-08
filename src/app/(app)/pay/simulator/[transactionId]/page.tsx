import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Alert } from "@/components/ui/alert"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { Amount } from "@/components/finance/finance-ui"
import { SimulatorButtons } from "@/components/finance/online-pay"
import { requireFamilyFinance } from "@/lib/finance/access"
import { isUuid } from "@/lib/list-params"
import { simulator } from "@/server/payments/providers"
import { getTransaction } from "@/services/finance"

export const metadata: Metadata = { title: "Test payment gateway" }

/**
 * Checkout page of the TEST payment gateway (development only). A real
 * provider hosts this page on its own site. Choosing an outcome sends a
 * signed webhook — the same path a real provider uses to confirm payments.
 */
export default async function SimulatorCheckoutPage({ params }: PageProps<"/pay/simulator/[transactionId]">) {
  await requireFamilyFinance()
  if (!simulator()) notFound()
  const { transactionId } = await params
  if (!isUuid(transactionId)) notFound()
  const { data: tx } = await getTransaction(transactionId)
  if (!tx || tx.provider !== "simulator") notFound()

  return (
    <div className="mx-auto max-w-md pt-6">
      <Alert tone="warning" className="mb-4">TEST MODE — no real money is charged. This page stands in for an external payment provider.</Alert>
      <Card>
        <CardHeader title="Payment simulator" description={`Transaction ${tx.provider_transaction_id ?? tx.id}`} />
        <CardBody className="space-y-4">
          <p className="text-sm text-muted">Amount to pay</p>
          <Amount value={tx.amount} currency={tx.currency.trim()} className="text-3xl font-semibold" />
          {tx.status === "pending" ? <SimulatorButtons transactionId={tx.id} /> : <Alert tone="info">This transaction is already {tx.status}.</Alert>}
        </CardBody>
      </Card>
    </div>
  )
}
