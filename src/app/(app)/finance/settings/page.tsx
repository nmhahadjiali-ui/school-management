import type { Metadata } from "next"
import { Alert } from "@/components/ui/alert"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/misc"
import { FinanceSettingsForm } from "@/components/finance/finance-settings-form"
import { requireFinance } from "@/lib/finance/access"
import { financeSettings } from "@/services/finance"

export const metadata: Metadata = { title: "Finance settings" }

export default async function FinanceSettingsPage() {
  const ctx = await requireFinance("admin")
  const { data: s, error } = await financeSettings(ctx.schoolId)
  if (error || !s) return <Alert tone="error">Settings could not be loaded. Please refresh the page.</Alert>
  const isFinanceAdmin = ctx.profile.role === "finance_admin"
  return (
    <>
      <PageHeader eyebrow="Finance" title="Finance settings" description="Changes are recorded in the financial audit log." />
      <Card className="max-w-2xl">
        <CardHeader title="Billing" />
        <CardBody>
          <FinanceSettingsForm
            settings={{ currency: s.currency.trim(), receipt_prefix: s.receipt_prefix, admin_finance_access: s.admin_finance_access, refunds_require_second_approver: s.refunds_require_second_approver }}
            canSetAdminAccess={isFinanceAdmin}
          />
        </CardBody>
      </Card>
    </>
  )
}
