import type { Metadata } from "next"
import { Plus } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import { ConfirmAction } from "@/components/ui/confirm-dialog"
import { DeleteWithPassword } from "@/components/ui/delete-with-password"
import { FormDialog } from "@/components/ui/form-dialog"
import { EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/misc"
import { GradeLevelFields } from "@/components/school/fields"
import { createGradeLevel, setGradeLevelStatus, updateGradeLevel } from "@/lib/actions/academic"
import { requireSchoolAdmin } from "@/lib/auth/session"
import { listGradeLevels } from "@/services/academic"
import { listSetupTemplates } from "@/services/operations"
import { Field } from "@/components/ui/form"
import { TemplatePicker, type TemplateOption } from "@/components/academics/template-picker"
import { applyGradeLevelTemplate, deleteGradingTemplate, saveGradingTemplate } from "@/lib/actions/templates"
import { GRADE_PRESETS, formatGrade, type GradeItem } from "@/lib/grading-templates"

export const metadata: Metadata = { title: "Grade levels" }

export default async function GradeLevelsPage() {
  const ctx = await requireSchoolAdmin()
  const [{ data: grades, error }, { data: saved }] = await Promise.all([listGradeLevels(ctx.schoolId), listSetupTemplates(ctx.schoolId, "grade_levels")])
  const have = new Set((grades ?? []).flatMap((g) => [`n:${g.name.toLowerCase()}`, `c:${g.code.toLowerCase()}`]))
  const owned = (g: GradeItem) => have.has(`n:${g.name.toLowerCase()}`) || have.has(`c:${g.code.toLowerCase()}`)
  const preview = (items: GradeItem[]) => items.map((g) => (owned(g) ? `${formatGrade(g)} · already added` : formatGrade(g)))
  const templates: TemplateOption[] = [
    ...GRADE_PRESETS.map((p) => ({ key: p.key, name: p.name, builtIn: true, preview: preview(p.items) })),
    ...(saved ?? []).map((t) => ({ key: t.id, name: t.name, builtIn: false, preview: preview(t.items as GradeItem[]) })),
  ]
  if (error) console.error("[GradeLevelsPage]", error.code, error.message)

  return (
    <>
      <PageHeader
        title="Grade levels"
        description="Your school's own grade structure (e.g. Nursery, Kinder, Grade 1 … Grade 12). Ordered by display order."
        actions={
          <>
            <TemplatePicker
              title="Grade levels from a template"
              description="Adds every grade level of the template at once. Grade levels you already have (same name or code) are kept as they are, so templates can be combined."
              templates={templates}
              onApply={applyGradeLevelTemplate}
              onDelete={deleteGradingTemplate}
            />
            {!!grades?.length && (
              <FormDialog trigger="Save as template" variant="secondary" title="Save these grade levels as a template" action={saveGradingTemplate.bind(null, "grade_levels", null)} submitLabel="Save template">
                <p className="text-sm text-muted">Saves the active grade levels (name, code and order), up to 20.</p>
                <Field name="name" label="Template name" placeholder="Our grade levels" required maxLength={80} />
              </FormDialog>
            )}
            <FormDialog trigger={<><Plus className="size-4" aria-hidden /> New grade level</>} title="New grade level" action={createGradeLevel} submitLabel="Create">
              <GradeLevelFields />
            </FormDialog>
          </>
        }
      />
      {error && <Alert tone="error" className="mb-4">Grade levels could not be loaded. Please refresh the page.</Alert>}
      <Card>
        {!grades?.length ? (
          <EmptyState title="No grade levels yet" description="Add the grade levels your school offers." />
        ) : (
          <Table label="Grade levels">
            <thead>
              <tr>
                <Th className="w-20">Order</Th>
                <Th>Name</Th>
                <Th>Code</Th>
                <Th>Status</Th>
                <Th className="text-right"><span className="sr-only">Actions</span></Th>
              </tr>
            </thead>
            <tbody>
              {grades.map((g) => (
                <tr key={g.id}>
                  <Td className="tabular-nums text-muted">{g.sort_order}</Td>
                  <Td className="font-medium">{g.name}</Td>
                  <Td className="font-mono text-xs">{g.code}</Td>
                  <Td><StatusBadge status={g.status} /></Td>
                  <Td>
                    <div className="flex justify-end gap-2">
                      <FormDialog trigger="Edit" variant="secondary" size="sm" title={`Edit ${g.name}`} action={updateGradeLevel.bind(null, g.id)}>
                        <GradeLevelFields grade={g} />
                      </FormDialog>
                      {g.status === "active" ? (
                        <ConfirmAction destructive trigger="Deactivate" title={`Deactivate ${g.name}?`} description="It will no longer be offered for new sections or enrollments. Existing records are kept." confirmLabel="Deactivate" onConfirm={setGradeLevelStatus.bind(null, g.id, "inactive")} />
                      ) : (
                        <ConfirmAction trigger="Reactivate" title={`Reactivate ${g.name}?`} description="It will be available for new sections and enrollments again." confirmLabel="Reactivate" onConfirm={setGradeLevelStatus.bind(null, g.id, "active")} />
                      )}
                      <DeleteWithPassword kind="grade_level" id={g.id} name={g.name} thing="grade level" />
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
