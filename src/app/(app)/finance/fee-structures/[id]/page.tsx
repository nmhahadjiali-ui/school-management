import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Alert } from "@/components/ui/alert"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { FormDialog } from "@/components/ui/form-dialog"
import { EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/misc"
import { Amount } from "@/components/finance/finance-ui"
import { DeleteItemButton, FeeStructureFields, GenerateCharges, StructureItemDialog, type StructureSection } from "@/components/finance/finance-actions"
import { saveFeeStructure } from "@/lib/actions/finance"
import { atLeast, requireFinance } from "@/lib/finance/access"
import { isUuid } from "@/lib/list-params"
import { gradeOptions } from "@/lib/options"
import { listGradeLevels, listSchoolSections } from "@/services/academic"
import { getFeeStructure, listFeeTypes, listStructureItems, structureChargeCount } from "@/services/finance"
import { DateText } from "@/components/ui/date-text"

export const metadata: Metadata = { title: "Fee structure" }

const FREQ: Record<string, string> = { one_time: "One-time", monthly: "Monthly", quarterly: "Quarterly", semester: "Per semester", annual: "Annual", custom: "Custom" }

export default async function FeeStructurePage({ params }: PageProps<"/finance/fee-structures/[id]">) {
  const ctx = await requireFinance("view")
  const { id } = await params
  if (!isUuid(id)) notFound()
  const { data: s } = await getFeeStructure(id)
  if (!s) notFound()
  const [{ data: items }, { data: feeTypes }, { data: grades }, { data: sections }] = await Promise.all([listStructureItems(id), listFeeTypes(ctx.schoolId, true), listGradeLevels(ctx.schoolId), listSchoolSections(ctx.schoolId)])
  const generated = await structureChargeCount((items ?? []).map((i) => i.id))
  const isAdmin = atLeast(ctx.level, "admin")
  const cur = ctx.currency
  const typeOptions = (feeTypes ?? []).map((t) => ({ value: t.id, label: t.name }))
  const total = (items ?? []).reduce((sum, i) => sum + Math.round(Number(i.amount) * 100), 0) / 100

  return (
    <>
      <PageHeader
        eyebrow={`Fee structure · ${s.academic_year?.name}`}
        title={s.name}
        description={`${s.section ? `${s.grade_level?.name ? `${s.grade_level.name} – ` : "Section "}${s.section.name}` : s.grade_level ? s.grade_level.name : "All enrolled students"} · ${generated} charge${generated === 1 ? "" : "s"} generated so far`}
        actions={isAdmin && (
          <FormDialog trigger="Edit" variant="secondary" title="Edit fee structure" action={saveFeeStructure.bind(null, id)}>
            <FeeStructureFields
              years={[{ value: s.academic_year_id, label: s.academic_year?.name ?? "" }]}
              grades={gradeOptions(grades ?? [])}
              sections={(sections ?? []) as StructureSection[]}
              value={s}
              yearLocked
            />
          </FormDialog>
        )}
      />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Fee items" description={`Total per student: ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${cur}`} action={isAdmin && typeOptions.length > 0 && <StructureItemDialog structureId={id} feeTypes={typeOptions} currency={cur} nextSequence={Math.max(0, ...(items ?? []).map((i) => i.sequence)) + 1} />} />
          {(items ?? []).length === 0 ? <EmptyState title="No fee items" description="Add the fees students in this structure pay." /> : (
            <Table label="Fee items">
              <thead><tr><Th>#</Th><Th>Item</Th><Th>Fee type</Th><Th>Frequency</Th><Th>First due</Th><Th className="text-right">Amount</Th><Th /></tr></thead>
              <tbody>
                {(items ?? []).map((i) => (
                  <tr key={i.id}>
                    <Td>{i.sequence}</Td>
                    <Td>{i.name}</Td>
                    <Td>{i.fee_type?.name}</Td>
                    <Td>{FREQ[i.frequency]}{i.installments > 1 && ` × ${i.installments}`}</Td>
                    <Td><DateText value={i.due_date} /></Td>
                    <Td className="text-right"><Amount value={i.amount} currency={cur} /></Td>
                    <Td>{isAdmin && <div className="flex justify-end gap-2"><StructureItemDialog structureId={id} feeTypes={typeOptions} item={i} currency={cur} /><DeleteItemButton itemId={i.id} /></div>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        {isAdmin && (
          <Card>
            <CardHeader title="Generate charges" description="Creates each item's charges for every student with an open enrollment that matches this structure. Running it again only adds what is missing (e.g. for newly enrolled students) — charges are never duplicated." />
            <CardBody>
              {s.status !== "active" ? <Alert tone="info">This structure is inactive. Activate it to generate charges.</Alert>
                : (items ?? []).length === 0 ? <p className="text-sm text-muted">Add fee items first.</p>
                : <GenerateCharges structureId={id} />}
            </CardBody>
          </Card>
        )}
        {generated > 0 && <p className="text-sm text-muted">Editing an item changes only charges generated afterwards. Existing charges keep their original amounts; adjust individual charges with discounts or adjustments. <StatusBadge status="locked" /> Items with charges cannot be removed.</p>}
      </div>
    </>
  )
}
