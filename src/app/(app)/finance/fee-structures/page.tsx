import type { Metadata } from "next"
import Link from "next/link"
import { Alert } from "@/components/ui/alert"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { FormDialog } from "@/components/ui/form-dialog"
import { EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/misc"
import { Amount } from "@/components/finance/finance-ui"
import { DiscountTypeDialog, FeeStructureFields, FeeTypeDialog, type StructureSection } from "@/components/finance/finance-actions"
import { saveFeeStructure } from "@/lib/actions/finance"
import { atLeast, requireFinance } from "@/lib/finance/access"
import { gradeOptions, yearOptions } from "@/lib/options"
import { listAcademicYears, listGradeLevels, listSchoolSections } from "@/services/academic"
import { listDiscountTypes, listFeeStructures, listFeeTypes } from "@/services/finance"

export const metadata: Metadata = { title: "Fee setup" }

export default async function FeeSetupPage() {
  const ctx = await requireFinance("view")
  const isAdmin = atLeast(ctx.level, "admin")
  const [structures, feeTypes, discountTypes, { data: years }, { data: grades }, { data: sections }] = await Promise.all([
    listFeeStructures(ctx.schoolId),
    listFeeTypes(ctx.schoolId),
    listDiscountTypes(ctx.schoolId),
    listAcademicYears(ctx.schoolId),
    listGradeLevels(ctx.schoolId),
    listSchoolSections(ctx.schoolId),
  ])
  // New structures go into years that are still open; the current year first.
  const openYears = (years ?? []).filter((y) => y.status !== "archived").sort((a, b) => Number(b.is_current) - Number(a.is_current))
  const cur = ctx.currency

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Fee setup"
        description="Fee types, discount types and fee structures. Changing setup never changes charges that were already generated."
        actions={isAdmin && (
          openYears.length > 0 && (
            <FormDialog trigger="New fee structure" title="New fee structure" description="A set of fees for an academic year, optionally limited to a grade level or section." action={saveFeeStructure.bind(null, null)} submitLabel="Create">
              <FeeStructureFields years={yearOptions(openYears)} grades={gradeOptions(grades ?? [])} sections={(sections ?? []) as StructureSection[]} />
            </FormDialog>
          )
        )}
      />
      {(structures.error || feeTypes.error) && <Alert tone="error" className="mb-6">Fee setup could not be loaded. Please refresh the page.</Alert>}
      {isAdmin && openYears.length === 0 && <Alert tone="info" className="mb-6">Create an academic year (Academic years page) before adding fee structures.</Alert>}
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
                    <Td>{s.section ? `${s.grade_level?.name ? `${s.grade_level.name} – ` : "Section "}${s.section.name}` : s.grade_level ? s.grade_level.name : "All students"}</Td>
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
