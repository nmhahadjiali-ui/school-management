import type { Metadata } from "next"
import { Plus } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import { ConfirmAction } from "@/components/ui/confirm-dialog"
import { DeleteWithPassword } from "@/components/ui/delete-with-password"
import { FormDialog } from "@/components/ui/form-dialog"
import { EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/misc"
import { ListToolbar } from "@/components/data/list-toolbar"
import { GradingPeriodFields } from "@/components/academics/fields"
import { createGradingPeriod, setGradingPeriodStatus, updateGradingPeriod } from "@/lib/actions/operations"
import { requireFeatureFor } from "@/lib/auth/session"
import { yearOptions } from "@/lib/options"
import { formatDate } from "@/lib/utils"
import { listAcademicYears, pickYear } from "@/services/academic"
import { listGradingPeriods, listSetupTemplates } from "@/services/operations"
import { Field } from "@/components/ui/form"
import { TemplatePicker, type TemplateOption } from "@/components/academics/template-picker"
import { applyGradingPeriodTemplate, deleteGradingTemplate, saveGradingTemplate } from "@/lib/actions/templates"
import { PERIOD_PRESETS, itemsToPeriods, presetPeriods, type PeriodItem, type PeriodRow } from "@/lib/grading-templates"

export const metadata: Metadata = { title: "Grading periods" }

export default async function GradingPeriodsPage({ searchParams }: PageProps<"/grading-periods">) {
  const ctx = await requireFeatureFor("school.records.manage", "grades")
  const sp = await searchParams
  const schoolId = ctx.profile.school_id!
  const { data: years } = await listAcademicYears(schoolId)
  const year = pickYear(years ?? [], typeof sp.year === "string" ? sp.year : undefined)
  const { data: periods, error } = year ? await listGradingPeriods(schoolId, year.id) : { data: [], error: null }
  const editable = year && year.status !== "archived"
  const { data: saved } = editable && !periods?.length ? await listSetupTemplates(schoolId, "grading_periods") : { data: [] }
  const describe = (rows: PeriodRow[]) => rows.map((r) => `${r.name} (${r.code}): ${formatDate(r.start_date, "UTC")} – ${formatDate(r.end_date, "UTC")}`)
  const templates: TemplateOption[] = year
    ? [
        ...PERIOD_PRESETS.map((p) => ({ key: p.key, name: p.name, builtIn: true, preview: describe(presetPeriods(p.key, year.start_date, year.end_date) ?? []) })),
        ...(saved ?? []).map((t) => {
          const result = itemsToPeriods(t.items as PeriodItem[], year.start_date, year.end_date)
          return { key: t.id, name: t.name, builtIn: false, preview: "error" in result ? [result.error] : describe(result.rows) }
        }),
      ]
    : []

  return (
    <>
      <PageHeader
        title="Grading periods"
        description="Your school's own terms (quarters, semesters, trimesters…). Teachers can enter grades only while a period is open."
        actions={
          editable ? (
            <>
              {!periods?.length ? (
                <TemplatePicker
                  title={`Grading periods from a template (${year.name})`}
                  description={`Creates all periods of ${year.name} at once. Built-in templates split the year (${formatDate(year.start_date, "UTC")} – ${formatDate(year.end_date, "UTC")}) evenly; you can edit the dates afterwards.`}
                  templates={templates}
                  onApply={applyGradingPeriodTemplate.bind(null, year.id)}
                  onDelete={deleteGradingTemplate}
                />
              ) : (
                <FormDialog trigger="Save as template" variant="secondary" title="Save these periods as a template" action={saveGradingTemplate.bind(null, "grading_periods", year.id)} submitLabel="Save template">
                  <p className="text-sm text-muted">The periods are saved by their position in the year, so the template fits later years too.</p>
                  <Field name="name" label="Template name" placeholder="Our 4 quarters" required maxLength={80} />
                </FormDialog>
              )}
              <FormDialog trigger={<><Plus className="size-4" aria-hidden /> New period</>} title={`New grading period (${year.name})`} action={createGradingPeriod.bind(null, year.id)} submitLabel="Create">
                <GradingPeriodFields nextSequence={(periods?.length ?? 0) + 1} />
              </FormDialog>
            </>
          ) : null
        }
      />
      {!year && <Alert tone="info" className="mb-4">Create an academic year first.</Alert>}
      {error && <Alert tone="error" className="mb-4">Grading periods could not be loaded.</Alert>}
      {year && (
        <Card>
          <ListToolbar filters={[{ name: "year", label: "Academic year", options: yearOptions(years ?? []), allLabel: `${year.name} (default)` }]} />
          {!periods?.length ? (
            <EmptyState title="No grading periods yet" description="Add the periods your school grades by, e.g. 1st–4th Quarter or Semester 1–2." />
          ) : (
            <Table label="Grading periods">
              <thead>
                <tr>
                  <Th className="w-16">#</Th>
                  <Th>Period</Th>
                  <Th>Dates</Th>
                  <Th>Status</Th>
                  <Th className="text-right"><span className="sr-only">Actions</span></Th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.id}>
                    <Td className="tabular-nums text-muted">{p.sequence}</Td>
                    <Td className="font-medium">{p.name} <span className="ml-1 font-mono text-xs text-muted">{p.code}</span></Td>
                    <Td className="text-muted">{formatDate(p.start_date, "UTC")} – {formatDate(p.end_date, "UTC")}</Td>
                    <Td><StatusBadge status={p.status} /></Td>
                    <Td>
                      {editable && (
                        <div className="flex flex-wrap justify-end gap-2">
                          <FormDialog trigger="Edit" variant="secondary" size="sm" title={`Edit ${p.name}`} action={updateGradingPeriod.bind(null, p.id)}>
                            <GradingPeriodFields period={p} />
                          </FormDialog>
                          {p.status !== "open" && (
                            <ConfirmAction trigger="Open" title={`Open ${p.name} for grading?`} description="Teachers will be able to enter and submit grades for this period." confirmLabel="Open period" onConfirm={setGradingPeriodStatus.bind(null, p.id, "open")} />
                          )}
                          {p.status === "open" && (
                            <ConfirmAction destructive trigger="Close" title={`Close ${p.name}?`} description="Teachers can no longer enter or change grades for this period. You can still review, approve and lock submitted grades." confirmLabel="Close period" onConfirm={setGradingPeriodStatus.bind(null, p.id, "closed")} />
                          )}
                          <DeleteWithPassword kind="grading_period" id={p.id} name={p.name} thing="grading period" />
                        </div>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </>
  )
}
