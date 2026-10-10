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
import { listGradingPeriods } from "@/services/operations"

export const metadata: Metadata = { title: "Grading periods" }

export default async function GradingPeriodsPage({ searchParams }: PageProps<"/grading-periods">) {
  const ctx = await requireFeatureFor("school.records.manage", "grades")
  const sp = await searchParams
  const schoolId = ctx.profile.school_id!
  const { data: years } = await listAcademicYears(schoolId)
  const year = pickYear(years ?? [], typeof sp.year === "string" ? sp.year : undefined)
  const { data: periods, error } = year ? await listGradingPeriods(schoolId, year.id) : { data: [], error: null }
  const editable = year && year.status !== "archived"

  return (
    <>
      <PageHeader
        title="Grading periods"
        description="Your school's own terms (quarters, semesters, trimesters…). Teachers can enter grades only while a period is open."
        actions={
          editable ? (
            <FormDialog trigger={<><Plus className="size-4" aria-hidden /> New period</>} title={`New grading period (${year.name})`} action={createGradingPeriod.bind(null, year.id)} submitLabel="Create">
              <GradingPeriodFields nextSequence={(periods?.length ?? 0) + 1} />
            </FormDialog>
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
