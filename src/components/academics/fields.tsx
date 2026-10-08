"use client"

import { CheckboxField, Field } from "@/components/ui/form"
import type { GradingPeriod, GradingScale } from "@/types/domain"

type Option = { value: string; label: string }
const withNone = (options: Option[], label: string) => [{ value: "", label }, ...options]

export const DAY_OPTIONS: Option[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d, i) => ({ value: String(i + 1), label: d }))

export function GradingPeriodFields({ period, nextSequence }: { period?: GradingPeriod; nextSequence?: number }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
        <Field name="name" label="Name" placeholder="1st Quarter" defaultValue={period?.name} required />
        <Field name="code" label="Code" placeholder="Q1" defaultValue={period?.code} required />
        <Field name="sequence" label="Order" type="number" min={1} max={20} defaultValue={period?.sequence ?? nextSequence ?? 1} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="start_date" label="Start date" type="date" defaultValue={period?.start_date} required />
        <Field name="end_date" label="End date" type="date" defaultValue={period?.end_date} required />
      </div>
    </>
  )
}

export function GradingScaleFields({ scale }: { scale?: GradingScale }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="name" label="Descriptor" placeholder="Very Good" defaultValue={scale?.name} required />
        <Field name="equivalent" label="Equivalent" placeholder="e.g. A, 1.25" defaultValue={scale?.equivalent ?? ""} />
        <Field name="minimum_score" label="Minimum score" type="number" step="0.01" defaultValue={scale?.minimum_score ?? ""} required />
        <Field name="maximum_score" label="Maximum score" type="number" step="0.01" defaultValue={scale?.maximum_score ?? ""} required />
      </div>
      <Field name="description" label="Description" as="textarea" defaultValue={scale?.description ?? ""} />
      <CheckboxField name="is_passing" label="Passing band" defaultChecked={scale?.is_passing ?? true} />
    </>
  )
}

export function ScheduleFields({
  loads,
  value,
}: {
  loads: Option[]
  value?: { teaching_load_id: string; day_of_week: number; start_time: string; end_time: string; room: string | null }
}) {
  return (
    <>
      <Field as="select" name="teaching_load_id" label="Class (section · subject · teacher)" defaultValue={value?.teaching_load_id ?? ""} options={withNone(loads, "Choose…")} required hint="Only assigned teaching loads can be scheduled." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field as="select" name="day_of_week" label="Day" defaultValue={String(value?.day_of_week ?? 1)} options={DAY_OPTIONS} required />
        <Field name="start_time" label="Start" type="time" defaultValue={value?.start_time.slice(0, 5) ?? "08:00"} required />
        <Field name="end_time" label="End" type="time" defaultValue={value?.end_time.slice(0, 5) ?? "09:00"} required />
      </div>
      <Field name="room" label="Room" defaultValue={value?.room ?? ""} />
    </>
  )
}

export function CourseworkFields({
  loads,
  value,
  dueLocal,
}: {
  loads?: Option[]
  value?: { title: string; description: string | null; status: string }
  dueLocal?: string
}) {
  return (
    <>
      {loads && <Field as="select" name="load_id" label="Class" options={withNone(loads, "Choose…")} required />}
      <Field name="title" label="Title" defaultValue={value?.title} required />
      <Field name="description" label="Instructions" as="textarea" rows={6} defaultValue={value?.description ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="due_at" label="Due" type="datetime-local" defaultValue={dueLocal ?? ""} hint="In the school's time zone." />
        <Field
          as="select"
          name="status"
          label="Status"
          defaultValue={value?.status ?? "published"}
          options={[
            { value: "published", label: "Published (visible to students)" },
            { value: "draft", label: "Draft (only you)" },
            ...(value ? [{ value: "archived", label: "Archived" }] : []),
          ]}
        />
      </div>
    </>
  )
}

export function GradeEditFields({ score, remarks }: { score: number; remarks: string | null }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
        <Field name="score" label="Score" type="number" step="0.01" defaultValue={score} required />
        <Field name="remarks" label="Remarks" defaultValue={remarks ?? ""} />
      </div>
      <Field name="reason" label="Reason for the change" as="textarea" required hint="Kept permanently in the grade's history." />
    </>
  )
}
