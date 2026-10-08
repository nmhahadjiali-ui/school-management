import type { Metadata } from "next"
import Link from "next/link"
import { Alert } from "@/components/ui/alert"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { FormDialog } from "@/components/ui/form-dialog"
import { Field } from "@/components/ui/form"
import { EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/misc"
import { Amount } from "@/components/finance/finance-ui"
import { DiscountTypeDialog, FeeTypeDialog } from "@/components/finance/finance-actions"
import { saveFeeStructure } from "@/lib/actions/finance"
import { atLeast, requireFinance } from "@/lib/finance/access"
import { gradeOptions, yearOptions } from "@/lib/options"
import { listAcademicYears, listGradeLevels } from "@/services/academic"
import { listDiscountTypes, listFeeStructures, listFeeTypes } from "@/services/finance"

export const metadata: Metadata = { title: "Fee setup" }

export default async function FeeSetupPage() {
  const ctx = await requireFinance("view")
  const isAdmin = atLeast(ctx.level, "admin")
  const [structures, feeTypes, discountTypes, { data: years }, { data: grades }] = await Promise.all([
    listFeeStructures(ctx.schoolId),
    listFeeTypes(ctx.schoolId),
    listDiscountTypes(ctx.schoolId),
    listAcademicYears(ctx.schoolId),
    listGradeLevels(ctx.schoolId),
  ])
  const cur = ctx.currency

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Fee setup"
        description="Fee types, discount types and fee structures. Changing setup never changes charges that were already generated."
        actions={isAdmin && (
          <FormDialog trigger="New fee structure" title="New fee structure" description="A set of fees for an academic year, optionally limited to a grade level or section." action={saveFeeStructure.bind(null, null)}>
            <Field name="name" label="Name" required maxLength={150} placeholder="e.g. Grade 7 — SY 2026-2027" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field as="select" name="academic_year_id" label="Academic year" required defaultValue={ctx.current_academic_year?.id} options={yearOptions(years ?? [])} />
              <Field as="select" name="grade_level_id" label="Grade level" options={[{ value: "", label: "All grade levels" }, ...gradeOptions(grades ?? [])]} />
            </div>
            <Field as="textarea" name="description" label="Description" maxLength={1000} />
          </FormDialog>
        )}
      />
      {(structures.error || feeTypes.error) && <Alert tone="error" className="mb-6">Fee setup could not be loaded. Please refresh the page.</Alert>}
      <div className="space-y-6">
        <Card>
          <CardHeader title="Fee structures" description="Open a structure to manage its items and generate charges for enrolled students." />
          {(structures.data ?? []).length === 0 ? <EmptyState title="No fee structures" description={isAdmin ? "Create fee types first, then a fee structure." : undefined} /> : (
            <Table label="Fee structures">
              <thead><tr><Th>Name</Th><Th>Year</Th><Th>Applies to</Th><Th className="text-right">Total per student</Th><Th>Status</Th></tr></thead>
              <tbody>
                {(structures.data ?? []).map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <Td><Link href={`/finance/fee-structures/${s.id}`} className="font-medium text-brand hover:underline">{s.name}</Link></Td>
                    <Td>{s.academic_year?.name}</Td>
                    <Td>{s.section ? `Section ${s.section.name}` : s.grade_level ? s.grade_level.name : "All students"}</Td>
                    <Td className="text-right"><Amount value={s.items.reduce((sum, i) => sum + Math.round(Number(i.amount) * 100), 0) / 100} currency={cur} /></Td>
                    <Td><StatusBadge status={s.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Fee types" action={isAdmin && <FeeTypeDialog />} />
            {(feeTypes.data ?? []).length === 0 ? <CardBody><p className="text-sm text-muted">No fee types yet (e.g. Tuition, Registration, Laboratory).</p></CardBody> : (
              <Table label="Fee types">
                <thead><tr><Th>Name</Th><Th>Code</Th><Th>Category</Th><Th>Status</Th><Th /></tr></thead>
                <tbody>
                  {(feeTypes.data ?? []).map((t) => (
                    <tr key={t.id}>
                      <Td>{t.name}</Td><Td className="font-mono text-xs">{t.code}</Td><Td className="capitalize">{t.category}</Td><Td><StatusBadge status={t.status} /></Td>
                      <Td className="text-right">{isAdmin && <FeeTypeDialog feeType={t} />}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <Card>
            <CardHeader title="Discount types" action={isAdmin && <DiscountTypeDialog />} />
            {(discountTypes.data ?? []).length === 0 ? <CardBody><p className="text-sm text-muted">No discount types yet (e.g. Sibling, Scholarship).</p></CardBody> : (
              <Table label="Discount types">
                <thead><tr><Th>Name</Th><Th>Code</Th><Th className="text-right">Value</Th><Th>Status</Th><Th /></tr></thead>
                <tbody>
                  {(discountTypes.data ?? []).map((d) => (
                    <tr key={d.id}>
                      <Td>{d.name}</Td><Td className="font-mono text-xs">{d.code}</Td>
                      <Td className="text-right">{d.calculation_type === "percentage" ? `${d.value}%` : <Amount value={d.value} currency={cur} />}</Td>
                      <Td><StatusBadge status={d.status} /></Td>
                      <Td className="text-right">{isAdmin && <DiscountTypeDialog discountType={d} />}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
