import type { Metadata } from "next"
import { Plus } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import { ConfirmAction } from "@/components/ui/confirm-dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Badge, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/misc"
import { GradingScaleFields } from "@/components/academics/fields"
import { createGradingScale, deleteGradingScale, updateGradingScale } from "@/lib/actions/operations"
import { requireFeatureFor } from "@/lib/auth/session"
import { listGradingScales, listSetupTemplates } from "@/services/operations"
import { Field } from "@/components/ui/form"
import { TemplatePicker, type TemplateOption } from "@/components/academics/template-picker"
import { applyGradingScaleTemplate, deleteGradingTemplate, saveGradingTemplate } from "@/lib/actions/templates"
import { SCALE_PRESETS, formatBand, presetBands, type BandItem } from "@/lib/grading-templates"
import { getSchoolSettings } from "@/services/settings"

export const metadata: Metadata = { title: "Grading scales" }

export default async function GradingScalesPage() {
  const ctx = await requireFeatureFor("school.records.manage", "grades")
  const schoolId = ctx.profile.school_id!
  const [{ data: scales, error }, { data: saved }, { data: settings }] = await Promise.all([
    listGradingScales(schoolId),
    listSetupTemplates(schoolId, "grading_scales"),
    getSchoolSettings(schoolId),
  ])
  const max = Number(settings?.grade_max_score ?? 100)
  const templates: TemplateOption[] = [
    ...SCALE_PRESETS.map((p) => ({ key: p.key, name: p.name, builtIn: true, preview: (presetBands(p.key, max) ?? []).map(formatBand) })),
    ...(saved ?? []).map((t) => ({ key: t.id, name: t.name, builtIn: false, preview: (t.items as BandItem[]).map(formatBand) })),
  ]

  return (
    <>
      <PageHeader
        title="Grading scale"
        description="How scores translate into descriptors for your school. A score falls in the band with the highest minimum it reaches. Maximum and passing scores are set in Settings."
        actions={
          <>
            <TemplatePicker
              title="Grading scale from a template"
              description="Sets up the whole scale at once. Grades are stored as scores, so applying a template never changes a grade, only how scores are described."
              templates={templates}
              applyWarning={scales?.length ? `This replaces the current ${scales.length} band${scales.length === 1 ? "" : "s"}.` : undefined}
              onApply={applyGradingScaleTemplate}
              onDelete={deleteGradingTemplate}
            />
            {!!scales?.length && (
              <FormDialog trigger="Save as template" variant="secondary" title="Save this grading scale as a template" action={saveGradingTemplate.bind(null, "grading_scales", null)} submitLabel="Save template">
                <Field name="name" label="Template name" placeholder="Our grading scale" required maxLength={80} />
              </FormDialog>
            )}
            <FormDialog trigger={<><Plus className="size-4" aria-hidden /> Add band</>} title="Add grading band" action={createGradingScale} submitLabel="Add">
              <GradingScaleFields />
            </FormDialog>
          </>
        }
      />
      {error && <Alert tone="error" className="mb-4">The grading scale could not be loaded.</Alert>}
      <Card>
        {!scales?.length ? (
          <EmptyState title="No grading bands yet" description="For example: 90–100 Outstanding, 85–89 Very Satisfactory, 80–84 Satisfactory, 75–79 Fairly Satisfactory, 0–74 Did Not Meet Expectations." />
        ) : (
          <Table label="Grading scale">
            <thead>
              <tr>
                <Th>Range</Th>
                <Th>Descriptor</Th>
                <Th>Equivalent</Th>
                <Th>Result</Th>
                <Th className="text-right"><span className="sr-only">Actions</span></Th>
              </tr>
            </thead>
            <tbody>
              {scales.map((s) => (
                <tr key={s.id}>
                  <Td className="tabular-nums">{Number(s.minimum_score)} – {Number(s.maximum_score)}</Td>
                  <Td className="font-medium">{s.name}{s.description && <p className="text-xs font-normal text-muted">{s.description}</p>}</Td>
                  <Td>{s.equivalent}</Td>
                  <Td>{s.is_passing ? <Badge tone="green">Passing</Badge> : <Badge tone="red">Failing</Badge>}</Td>
                  <Td>
                    <div className="flex justify-end gap-2">
                      <FormDialog trigger="Edit" variant="secondary" size="sm" title={`Edit ${s.name}`} action={updateGradingScale.bind(null, s.id)}>
                        <GradingScaleFields scale={s} />
                      </FormDialog>
                      <ConfirmAction destructive trigger="Remove" title={`Remove ${s.name}?`} description="Grades are stored as scores, so no grade is changed; only how scores are described." confirmLabel="Remove" onConfirm={deleteGradingScale.bind(null, s.id)} />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  )
}
