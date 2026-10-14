import type { Metadata } from "next"
import { Clock } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import { Field } from "@/components/ui/form"
import { FormDialog } from "@/components/ui/form-dialog"
import { PageHeader } from "@/components/ui/misc"
import { ListToolbar } from "@/components/data/list-toolbar"
import { ScheduleFields } from "@/components/academics/fields"
import { TimeSlotFields } from "@/components/academics/time-slot-builder"
import { ScheduleBoard } from "@/components/academics/schedule-board"
import { TemplatePicker, type TemplateOption } from "@/components/academics/template-picker"
import { addTimeSlots, createSchedule } from "@/lib/actions/operations"
import { applySlotTemplate, deleteGradingTemplate, saveGradingTemplate } from "@/lib/actions/templates"
import { requireFeatureFor } from "@/lib/auth/session"
import { isUuid } from "@/lib/list-params"
import { gradeOptions, sectionOptions, teacherOptions, yearOptions } from "@/lib/options"
import { SLOT_PRESETS, slotPreview, type SlotItem } from "@/lib/schedule-slots"
import { listAcademicYears, listSectionOptions, pickYear } from "@/services/academic"
import { listActiveTeachers } from "@/services/people"
import { listSchedules, listSetupTemplates, listTimeSlots, loadLabel, teachingLoads } from "@/services/operations"

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
  const [sections, teachers, loads, slots, saved] = await Promise.all([
    listSectionOptions(schoolId, year.id),
    listActiveTeachers(schoolId),
    teachingLoads(schoolId, year.id),
    listTimeSlots(schoolId, year.id),
    listSetupTemplates(schoolId, "schedule_slots"),
  ])
  const allSections = (sections.data ?? []) as { id: string; name: string; grade_level_id: string; grade_level: { name: string } | null }[]
  const grades = [...new Map(allSections.map((s) => [s.grade_level_id, { id: s.grade_level_id, name: s.grade_level?.name ?? "" }])).values()]
  // Ids from the URL only count when they belong to this year's lists (a year change leaves stale ones behind).
  const pick = (v: unknown, ids: string[]) => (typeof v === "string" && isUuid(v) && ids.includes(v) ? v : undefined)
  const grade = pick(sp.grade, grades.map((g) => g.id))
  const sectionList = grade ? allSections.filter((s) => s.grade_level_id === grade) : allSections
  const section = pick(sp.section, sectionList.map((s) => s.id))
  const teacher = pick(sp.teacher, (teachers.data ?? []).map((t) => t.id))
  const gradeSectionIds = grade && !section ? sectionList.map((s) => s.id) : undefined
  const schedule = await listSchedules({ schoolId, yearId: year.id, sectionId: section, sectionIds: gradeSectionIds, teacherId: teacher })
  const toOption = (l: (typeof loads.data)[number]) => ({ value: l.id, label: `${loadLabel(l)} · ${l.teacher.last_name}, ${l.teacher.first_name}` })
  const loadOptions = loads.data.map(toOption)
  // "Add class" offers only the classes of the chosen grade / section / teacher.
  const slotLoadOptions = loads.data
    .filter((l) => (!section || l.section_id === section) && (!gradeSectionIds || gradeSectionIds.includes(l.section_id)) && (!teacher || l.teacher_id === teacher))
    .map(toOption)
  const loadId = (r: { section_id: string; subject_id: string; teacher_id: string }) =>
    loads.data.find((l) => l.section_id === r.section_id && l.subject_id === r.subject_id && l.teacher_id === r.teacher_id)?.id ?? ""
  const editable = year.status !== "archived"
  const templates: TemplateOption[] = [
    ...SLOT_PRESETS.map((p) => ({ key: p.key, name: p.name, builtIn: true, preview: slotPreview(p.items) })),
    ...(saved.data ?? []).map((t) => ({ key: t.id, name: t.name, builtIn: false, preview: slotPreview(t.items as SlotItem[]) })),
  ]
  const error = schedule.error || slots.error

  // Overview (no section/teacher chosen): one row per section, grouped under its grade level.
  const loadsOf = (sectionId: string) => loads.data.filter((l) => l.section_id === sectionId).map(toOption)
  const bands = section || teacher
    ? null
    : (grade ? grades.filter((g) => g.id === grade) : grades)
        .map((g) => ({
          key: g.id,
          sections: allSections
            .filter((x) => x.grade_level_id === g.id)
            .map((x) => ({ id: x.id, title: `${g.name} – ${x.name}`, rows: schedule.data.filter((r) => r.section_id === x.id) })),
        }))
        .filter((g) => g.sections.length > 0)
  // Classes of sections no longer in the active list (e.g. deactivated) still show, at the end.
  const orphanRows = bands && !grade ? schedule.data.filter((r) => !allSections.some((x) => x.id === r.section_id)) : []

  return (
    <>
      <PageHeader
        title="Schedules"
        description="Set the time slots of each day, then press Edit on a day to add classes (subject, section and teacher). Teacher and section double-bookings are rejected; room clashes too when enabled in Settings."
        actions={
          editable ? (
            <>
              <TemplatePicker
                title="Time slots from a template"
                description={`Adds every time slot of the template to ${year.name}. Slots you already have are kept, and no classes are changed.`}
                templates={templates}
                onApply={applySlotTemplate.bind(null, year.id)}
                onDelete={deleteGradingTemplate}
              />
              {slots.data.length > 0 && (
                <FormDialog trigger="Save as template" variant="secondary" title="Save these time slots as a template" action={saveGradingTemplate.bind(null, "schedule_slots", year.id)} submitLabel="Save template">
                  <p className="text-sm text-muted">Saves the days and times of {year.name}&apos;s {slots.data.length} time slots (not the classes in them), so you can reuse them in another year.</p>
                  <Field name="name" label="Template name" placeholder="Regular week" required maxLength={80} />
                </FormDialog>
              )}
              {loadOptions.length > 0 && (
                <FormDialog trigger="Custom time…" variant="secondary" title={`Schedule a class at any time (${year.name})`} action={createSchedule} submitLabel="Schedule">
                  <ScheduleFields loads={loadOptions} />
                </FormDialog>
              )}
              <FormDialog trigger={<><Clock className="size-4" aria-hidden /> Add time slots</>} title={`Add time slots (${year.name})`} description="Choose the days, then describe the periods. The slots are listed below and can be adjusted one by one." action={addTimeSlots.bind(null, year.id)} submitLabel="Add time slots">
                <TimeSlotFields existing={slots.data} />
              </FormDialog>
            </>
          ) : null
        }
      />
      {!loadOptions.length && <Alert tone="info" className="mb-4">Add teaching loads (teacher × subject × section) for {year.name} before putting classes in the time slots.</Alert>}
      {error && <Alert tone="error" className="mb-4">The schedule could not be loaded.</Alert>}
      <Card>
        <ListToolbar
          filters={[
            { name: "year", label: "Academic year", options: yearOptions(years ?? []), allLabel: `${year.name} (default)`, clears: ["grade", "section"] },
            { name: "grade", label: "Grade level", options: gradeOptions(grades), allLabel: "All grade levels", clears: ["section"] },
            { name: "section", label: "Section", options: sectionOptions(sectionList), allLabel: grade ? "All sections of the grade" : "All sections" },
            { name: "teacher", label: "Teacher", options: teacherOptions(teachers.data ?? []), allLabel: "All teachers" },
          ]}
        />
        <p className="border-b border-border px-4 py-2 text-xs text-muted">
          {section || teacher
            ? `Showing ${[section && sectionOptions(sectionList).find((o) => o.value === section)?.label, teacher && teacherOptions(teachers.data ?? []).find((o) => o.value === teacher)?.label].filter(Boolean).join(" · ")}: `
            : grade
              ? `Showing ${grades.find((g) => g.id === grade)?.name} (${sectionList.length} section${sectionList.length === 1 ? "" : "s"}): `
              : `Showing all ${allSections.length} sections: `}
          {schedule.data.length} class{schedule.data.length === 1 ? "" : "es"} a week.
          {!section && !teacher && " One row per section, grouped by grade level."}
        </p>
        {bands && bands.length > 0 && (slots.data.length > 0 || schedule.data.length > 0) ? (
          <>
            {bands.map((g) => (
              <div key={g.key}>
                {g.sections.map((x) => (
                  <section key={x.id} aria-labelledby={`section-${x.id}`} className="border-t border-border">
                    <h2 id={`section-${x.id}`} className="border-l-4 border-brand bg-brand/5 px-4 py-1.5 text-sm font-semibold">{x.title}</h2>
                    <ScheduleBoard yearId={year.id} slots={slots.data} rows={x.rows} loads={loadsOf(x.id)} allLoads={loadOptions} loadId={loadId} show="teacher" single editable={editable} />
                  </section>
                ))}
              </div>
            ))}
            {orphanRows.length > 0 && (
              <section aria-labelledby="grade-other" className="border-t border-border">
                <h2 id="grade-other" className="border-l-4 border-slate-400 bg-slate-100 px-4 py-1.5 text-sm font-semibold">Other sections (no longer active)</h2>
                <ScheduleBoard yearId={year.id} slots={[]} rows={orphanRows} loads={[]} allLoads={loadOptions} loadId={loadId} show="both" single={false} editable={editable} />
              </section>
            )}
          </>
        ) : (
          <ScheduleBoard
            yearId={year.id}
            slots={slots.data}
            rows={schedule.data}
            loads={slotLoadOptions}
            allLoads={loadOptions}
            loadId={loadId}
            show={section ? "teacher" : teacher ? "section" : "both"}
            single={Boolean(section || teacher)}
            editable={editable}
          />
        )}
      </Card>
    </>
  )
}
