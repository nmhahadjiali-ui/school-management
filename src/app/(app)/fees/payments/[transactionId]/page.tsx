import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Alert } from "@/components/ui/alert"
import { Card, CardBody } from "@/components/ui/card"
import { PageHeader, StatusBadge } from "@/components/ui/misc"
import { Amount } from "@/components/finance/finance-ui"
import { requireFamilyFinance } from "@/lib/finance/access"
import { isUuid } from "@/lib/list-params"
import { createClient } from "@/lib/supabase/server"
import { getTransaction } from "@/services/finance"

export const metadata: Metadata = { title: "Online payment" }

/**
 * Where the provider sends the payer back. This page only READS the status
 * recorded by the server-side webhook; arriving here never marks anything paid.
 */
export default async function TransactionStatusPage({ params }: PageProps<"/fees/payments/[transactionId]">) {
  await requireFamilyFinance()
  const { transactionId } = await params
  if (!isUuid(transactionId)) notFound()
  const { data: tx } = await getTransaction(transactionId)
  if (!tx) notFound()
  const supabase = await createClient()
  const { data: payment } = await supabase.from("payments").select("id, receipts(id, receipt_number)").eq("payment_transaction_id", tx.id).maybeSingle()
  const receipt = payment?.receipts?.[0]

  return (
    <>
      <PageHeader title="Online payment" />
      <Card className="max-w-xl">
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between">
            <Amount value={tx.amount} currency={tx.currency.trim()} className="text-2xl font-semibold" />
            <StatusBadge status={tx.status} />
          </div>
          {tx.status === "successful" && <Alert tone="success">Payment confirmed by the provider{receipt ? ` — receipt ${receipt.receipt_number}` : ""}. Thank you!</Alert>}
          {(tx.status === "pending" || tx.status === "processing") && <Alert tone="info">We are waiting for the payment provider to confirm this payment. This page does not change the status — refresh in a moment.</Alert>}
          {tx.status === "failed" && <Alert tone="error">The payment did not go through{tx.failure_reason ? `: ${tx.failure_reason}` : ""}. No money was recorded. You can try again.</Alert>}
          {(tx.status === "cancelled" || tx.status === "expired") && <Alert tone="warning">The payment was {tx.status}. No money was recorded.</Alert>}
          <div className="flex gap-4 text-sm font-medium">
            {receipt && <Link href={`/receipts/${receipt.id}`} className="text-brand hover:underline">View receipt</Link>}
            <Link href={`/fees/${tx.student_id}`} className="text-brand hover:underline">Back to account</Link>
          </div>
          <p className="text-xs text-muted">Reference: {tx.id}</p>
        </CardBody>
      </Card>
    </>
  )
}
