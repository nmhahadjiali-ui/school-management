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
import { listGradingScales } from "@/services/operations"

export const metadata: Metadata = { title: "Grading scales" }

export default async function GradingScalesPage() {
  const ctx = await requireFeatureFor("school.records.manage", "grades")
  const { data: scales, error } = await listGradingScales(ctx.profile.school_id!)

  return (
    <>
      <PageHeader
        title="Grading scale"
        description="How scores translate into descriptors for your school. A score falls in the band with the highest minimum it reaches. Maximum and passing scores are set in Settings."
        actions={
          <FormDialog trigger={<><Plus className="size-4" aria-hidden /> Add band</>} title="Add grading band" action={createGradingScale} submitLabel="Add">
            <GradingScaleFields />
          </FormDialog>
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
