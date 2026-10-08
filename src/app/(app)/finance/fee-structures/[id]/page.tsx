import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Alert } from "@/components/ui/alert"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { Field } from "@/components/ui/form"
import { FormDialog } from "@/components/ui/form-dialog"
import { EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/misc"
import { Amount } from "@/components/finance/finance-ui"
import { DeleteItemButton, GenerateCharges, StructureItemDialog } from "@/components/finance/finance-actions"
import { saveFeeStructure } from "@/lib/actions/finance"
import { atLeast, requireFinance } from "@/lib/finance/access"
import { isUuid } from "@/lib/list-params"
import { gradeOptions } from "@/lib/options"
import { listGradeLevels } from "@/services/academic"
import { getFeeStructure, listFeeTypes, listStructureItems, structureChargeCount } from "@/services/finance"

export const metadata: Metadata = { title: "Fee structure" }

const FREQ: Record<string, string> = { one_time: "One-time", monthly: "Monthly", quarterly: "Quarterly", semester: "Per semester", annual: "Annual", custom: "Custom" }

export default async function FeeStructurePage({ params }: PageProps<"/finance/fee-structures/[id]">) {
  const ctx = await requireFinance("view")
  const { id } = await params
  if (!isUuid(id)) notFound()
  const { data: s } = await getFeeStructure(id)
  if (!s) notFound()
  const [{ data: items }, { data: feeTypes }, { data: grades }] = await Promise.all([listStructureItems(id), listFeeTypes(ctx.schoolId, true), listGradeLevels(ctx.schoolId)])
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
        description={`${s.section ? `Section ${s.section.name}` : s.grade_level ? s.grade_level.name : "All enrolled students"} · ${generated} charge${generated === 1 ? "" : "s"} generated so far`}
        actions={isAdmin && (
          <FormDialog trigger="Edit" variant="secondary" title="Edit fee structure" action={saveFeeStructure.bind(null, id)}>
            <input type="hidden" name="academic_year_id" value={s.academic_year_id} />
            <Field name="name" label="Name" required defaultValue={s.name} maxLength={150} />
            <Field as="select" name="grade_level_id" label="Grade level" defaultValue={s.grade_level_id ?? ""} options={[{ value: "", label: "All grade levels" }, ...gradeOptions(grades ?? [])]} />
            <input type="hidden" name="section_id" value={s.section_id ?? ""} />
            <Field as="textarea" name="description" label="Description" defaultValue={s.description ?? ""} maxLength={1000} />
            <Field as="select" name="status" label="Status" defaultValue={s.status} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
          </FormDialog>
        )}
      />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Fee items" description={`Total per student: ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${cur}`} action={isAdmin && typeOptions.length > 0 && <StructureItemDialog structureId={id} feeTypes={typeOptions} />} />
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
                    <Td>{i.due_date ?? "—"}</Td>
                    <Td className="text-right"><Amount value={i.amount} currency={cur} /></Td>
                    <Td className="whitespace-nowrap text-right">{isAdmin && <><StructureItemDialog structureId={id} feeTypes={typeOptions} item={i} /><DeleteItemButton itemId={i.id} /></>}</Td>
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
