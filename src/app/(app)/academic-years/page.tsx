import type { Metadata } from "next"
import { Plus } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import { ConfirmAction } from "@/components/ui/confirm-dialog"
import { DeleteWithPassword } from "@/components/ui/delete-with-password"
import { FormDialog } from "@/components/ui/form-dialog"
import { Badge, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/misc"
import { AcademicYearFields } from "@/components/school/fields"
import {
  activateAcademicYear,
  archiveAcademicYear,
  createAcademicYear,
  setCurrentAcademicYear,
  updateAcademicYear,
} from "@/lib/actions/academic"
import { requireSchoolAdmin } from "@/lib/auth/session"
import { formatDate } from "@/lib/utils"
import { listAcademicYears } from "@/services/academic"

export const metadata: Metadata = { title: "Academic years" }

export default async function AcademicYearsPage() {
  const ctx = await requireSchoolAdmin()
  const { data: years, error } = await listAcademicYears(ctx.schoolId)
  if (error) console.error("[AcademicYearsPage]", error.code, error.message)

  return (
    <>
      <PageHeader
        title="Academic years"
        description="Each year holds its own sections, enrollments and teacher assignments. Archived years are kept as read-only history."
        actions={
          <FormDialog trigger={<><Plus className="size-4" aria-hidden /> New academic year</>} title="New academic year" description="New years start as planned." action={createAcademicYear} submitLabel="Create">
            <AcademicYearFields />
          </FormDialog>
        }
      />
      {error && <Alert tone="error" className="mb-4">Academic years could not be loaded. Please refresh the page.</Alert>}
      {!years?.some((y) => y.is_current) && years?.length ? (
        <Alert tone="warning" className="mb-4">No academic year is marked as current. Activate a year and set it as current.</Alert>
      ) : null}
      <Card>
        {!years?.length ? (
          <EmptyState title="No academic years yet" description="Create your first academic year, e.g. 2026-2027." />
        ) : (
          <Table label="Academic years">
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Dates</Th>
                <Th>Status</Th>
                <Th className="text-right"><span className="sr-only">Actions</span></Th>
              </tr>
            </thead>
            <tbody>
              {years.map((y) => (
                <tr key={y.id}>
                  <Td className="font-medium">
                    {y.name} {y.is_current && <Badge tone="blue">Current</Badge>}
                  </Td>
                  <Td className="text-muted">{formatDate(y.start_date, "UTC")} – {formatDate(y.end_date, "UTC")}</Td>
                  <Td><StatusBadge status={y.status} /></Td>
                  <Td>
                    {y.status !== "archived" && (
                      <div className="flex flex-wrap justify-end gap-2">
                        <FormDialog trigger="Edit" variant="secondary" size="sm" title={`Edit ${y.name}`} action={updateAcademicYear.bind(null, y.id)}>
                          <AcademicYearFields year={y} />
                        </FormDialog>
                        {y.status === "planned" && (
                          <ConfirmAction trigger="Activate" title={`Activate ${y.name}?`} description="Active years can be set as current and receive sections and enrollments." confirmLabel="Activate" onConfirm={activateAcademicYear.bind(null, y.id)} />
                        )}
                        {y.status === "active" && !y.is_current && (
                          <ConfirmAction trigger="Set as current" title={`Make ${y.name} the current year?`} description="Dashboards, enrollment and assignment screens default to the current year." confirmLabel="Set as current" onConfirm={setCurrentAcademicYear.bind(null, y.id)} />
                        )}
                        <ConfirmAction
                          destructive
                          trigger="Archive"
                          title={`Archive ${y.name}?`}
                          description={
                            <>
                              Open enrollments in this year will be marked <strong>completed</strong>, and the year&apos;s sections, enrollments and assignments become read-only. This cannot be undone.
                              {y.is_current && " This is the current year: set another year as current afterwards."}
                            </>
                          }
                          confirmLabel="Archive year"
                          onConfirm={archiveAcademicYear.bind(null, y.id)}
                        />
                        {!y.is_current && <DeleteWithPassword kind="academic_year" id={y.id} name={y.name} thing="academic year" />}
                      </div>
                    )}
                    {y.status === "archived" && !y.is_current && (
                      <div className="flex justify-end">
                        <DeleteWithPassword kind="academic_year" id={y.id} name={y.name} thing="academic year" />
                      </div>
                    )}
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
