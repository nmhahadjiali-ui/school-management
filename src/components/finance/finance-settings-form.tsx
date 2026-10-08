"use client"

import { CheckboxField, Field, Form, SubmitButton } from "@/components/ui/form"
import { saveFinanceSettings } from "@/lib/actions/finance"

export function FinanceSettingsForm({
  settings,
  canSetAdminAccess,
}: {
  settings: { currency: string; receipt_prefix: string; admin_finance_access: string; refunds_require_second_approver: boolean }
  canSetAdminAccess: boolean
}) {
  return (
    <Form action={saveFinanceSettings}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="currency" label="Currency" required maxLength={3} defaultValue={settings.currency} hint="ISO code, e.g. PHP. Applies to new charges and payments; existing records keep their currency." />
        <Field name="receipt_prefix" label="Receipt prefix" required maxLength={10} defaultValue={settings.receipt_prefix} hint="Receipts are numbered PREFIX-YEAR-000001." />
      </div>
      <CheckboxField name="refunds_require_second_approver" label="Refunds need a second person to approve" hint="The person who requests a refund cannot approve it." defaultChecked={settings.refunds_require_second_approver} />
      {canSetAdminAccess ? (
        <Field
          as="select"
          name="admin_finance_access"
          label="School administrators' finance access"
          defaultValue={settings.admin_finance_access}
          hint="Separation of duties: decide whether school admins can manage finances, only view them, or not see them at all."
          options={[
            { value: "full", label: "Full — same as a finance admin" },
            { value: "view", label: "View only" },
            { value: "none", label: "No access" },
          ]}
        />
      ) : (
        <p className="text-sm text-muted">School administrators&apos; finance access: <span className="font-medium">{settings.admin_finance_access}</span> (set by a finance administrator).</p>
      )}
      <div className="flex justify-end"><SubmitButton>Save settings</SubmitButton></div>
    </Form>
  )
}
