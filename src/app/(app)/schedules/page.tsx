import type { Metadata } from "next"
import { Plus } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import { ConfirmAction } from "@/components/ui/confirm-dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { PageHeader } from "@/components/ui/misc"
import { ListToolbar } from "@/components/data/list-toolbar"
import { ScheduleFields } from "@/components/academics/fields"
import { Timetable } from "@/components/academics/timetable"
import { createSchedule, deleteSchedule, updateSchedule } from "@/lib/actions/operations"
import { requireFeatureFor } from "@/lib/auth/session"
import { isUuid } from "@/lib/list-params"
import { sectionOptions, teacherOptions, yearOptions } from "@/lib/options"
import { listAcademicYears, listSectionOptions, pickYear } from "@/services/academic"
import { listActiveTeachers } from "@/services/people"
import { listSchedules, loadLabel, teachingLoads } from "@/services/operations"

export const metadata: Metadata = { title: "Schedules" }

export default async function SchedulesPage({ searchParams }: PageProps<"/schedules">) {
  const ctx = await requireFeatureFor("school.records.manage", "schedules")
  const schoolId = ctx.profile.school_id!
  const sp = await searchParams
  const { data: years } = await listAcademicYears(schoolId)
  const year = pickYear(years ?? [], typeof sp.year === "string" ? sp.year : undefined)
  if (!year) {
    return (
      <>
        <PageHeader title="Schedules" />
        <Alert tone="info">Create an academic year first.</Alert>
      </>
    )
  }
  const section = typeof sp.section === "string" && isUuid(sp.section) ? sp.section : undefined
  const teacher = typeof sp.teacher === "string" && isUuid(sp.teacher) ? sp.teacher : undefined
  const [sections, teachers, loads] = await Promise.all([
    listSectionOptions(schoolId, year.id),
    listActiveTeachers(schoolId),
    teachingLoads(schoolId, year.id),
  ])
  const sectionList = (sections.data ?? []) as { id: string; name: string; grade_level: { name: string } | null }[]
  const loadOptions = loads.data.map((l) => ({ value: l.id, label: `${loadLabel(l)} · ${l.teacher.last_name}, ${l.teacher.first_name}` }))
  const loadId = (r: { section_id: string; subject_id: string; teacher_id: string }) =>
    loads.data.find((l) => l.section_id === r.section_id && l.subject_id === r.subject_id && l.teacher_id === r.teacher_id)?.id ?? ""
  const editable = year.status !== "archived"
  const filtered = Boolean(section || teacher)
  const { data: rows, error } = filtered ? await listSchedules({ schoolId, yearId: year.id, sectionId: section, teacherId: teacher }) : { data: [], error: null }

  return (
    <>
      <PageHeader
        title="Schedules"
        description="Weekly timetable. Teacher and section double-bookings are rejected by the database; room clashes too when enabled in Settings."
        actions={
          editable && loadOptions.length ? (
            <FormDialog trigger={<><Plus className="size-4" aria-hidden /> Schedule a class</>} title={`Schedule a class (${year.name})`} action={createSchedule} submitLabel="Schedule">
              <ScheduleFields loads={loadOptions} />
            </FormDialog>
          ) : null
        }
      />
      {!loadOptions.length && <Alert tone="info" className="mb-4">Add teaching loads (teacher × subject × section) for {year.name} before scheduling classes.</Alert>}
      {error && <Alert tone="error" className="mb-4">The schedule could not be loaded.</Alert>}
      <Card>
        <ListToolbar
          filters={[
            { name: "year", label: "Academic year", options: yearOptions(years ?? []), allLabel: `${year.name} (default)` },
            { name: "section", label: "Section", options: sectionOptions(sectionList), allLabel: "Choose a section…" },
            { name: "teacher", label: "Teacher", options: teacherOptions(teachers.data ?? []), allLabel: "…or a teacher" },
          ]}
        />
        {!filtered ? (
          <p className="px-5 py-10 text-center text-sm text-muted">Choose a section or a teacher to see their week.</p>
        ) : (
          <Timetable
            rows={rows}
            show={section ? "teacher" : "section"}
            actions={
              editable
                ? (r) => (
                    <>
                      <FormDialog trigger="Edit" variant="secondary" size="sm" title="Edit class" action={updateSchedule.bind(null, r.id)}>
                        <ScheduleFields loads={loadOptions} value={{ ...r, teaching_load_id: loadId(r) }} />
                      </FormDialog>
                      <ConfirmAction destructive trigger="Remove" title="Remove this class from the schedule?" description={`${r.subject.name}, ${r.start_time.slice(0, 5)}–${r.end_time.slice(0, 5)}. Attendance and grades are not affected.`} confirmLabel="Remove" onConfirm={deleteSchedule.bind(null, r.id)} />
                    </>
                  )
                : undefined
            }
          />
        )}
      </Card>
    </>
  )
}
