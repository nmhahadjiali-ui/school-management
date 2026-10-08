"use client"

import { CheckboxField, Field, Form, SubmitButton } from "@/components/ui/form"
import { RecordPicker, type PickerOption } from "@/components/data/record-picker"
import { LinkButton } from "@/components/ui/button"
import type { ActionResult } from "@/lib/action-result"
import type { AcademicYear, GradeLevel, Guardian, Section, Student, StudentGuardian, Subject, Teacher } from "@/types/domain"

export type Option = { value: string; label: string }
const today = () => new Date().toISOString().slice(0, 10)
const withNone = (options: Option[], label: string) => [{ value: "", label }, ...options]

// --- Academic structure ------------------------------------------------------------
export function AcademicYearFields({ year }: { year?: AcademicYear }) {
  return (
    <>
      <Field name="name" label="Name" placeholder="2026-2027" defaultValue={year?.name} required />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="start_date" label="Start date" type="date" defaultValue={year?.start_date} required />
        <Field name="end_date" label="End date" type="date" defaultValue={year?.end_date} required />
      </div>
    </>
  )
}

export function GradeLevelFields({ grade }: { grade?: GradeLevel }) {
  return (
    <>
      <Field name="name" label="Name" placeholder="Grade 1" defaultValue={grade?.name} required />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="code" label="Code" placeholder="G1" defaultValue={grade?.code} required />
        <Field name="sort_order" label="Display order" type="number" defaultValue={grade?.sort_order ?? 0} hint="Lower numbers come first." required />
      </div>
    </>
  )
}

export function SubjectFields({ subject }: { subject?: Subject }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Field name="name" label="Name" placeholder="Mathematics" defaultValue={subject?.name} required />
        <Field name="code" label="Code" placeholder="MATH" defaultValue={subject?.code} required />
      </div>
      <Field name="description" label="Description" as="textarea" defaultValue={subject?.description ?? ""} />
    </>
  )
}

export function SectionFields({
  section,
  years,
  grades,
  teachers,
}: {
  section?: Section
  years?: Option[]
  grades?: Option[]
  teachers: Option[]
}) {
  return (
    <>
      {years && grades && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field as="select" name="academic_year_id" label="Academic year" options={years} required />
          <Field as="select" name="grade_level_id" label="Grade level" options={withNone(grades, "Choose…")} required />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="name" label="Section name" placeholder="A" defaultValue={section?.name} required />
        <Field name="code" label="Code" defaultValue={section?.code ?? ""} />
        <Field name="capacity" label="Capacity" type="number" min={1} defaultValue={section?.capacity ?? ""} hint="Leave blank for no limit." />
        <Field name="room" label="Room" defaultValue={section?.room ?? ""} />
      </div>
      <Field as="select" name="adviser_teacher_id" label="Adviser" defaultValue={section?.adviser_teacher_id ?? ""} options={withNone(teachers, "No adviser")} />
    </>
  )
}

export function AssignmentFields({
  yearId,
  teachers,
  subjects,
  sections,
  teacherId,
  sectionId,
}: {
  yearId: string
  teachers?: Option[]
  subjects: Option[]
  sections?: Option[]
  teacherId?: string
  sectionId?: string
}) {
  return (
    <>
      <input type="hidden" name="academic_year_id" value={yearId} />
      {teacherId ? <input type="hidden" name="teacher_id" value={teacherId} /> : <Field as="select" name="teacher_id" label="Teacher" options={withNone(teachers ?? [], "Choose…")} required />}
      <Field as="select" name="subject_id" label="Subject" options={withNone(subjects, "Choose…")} required />
      {sectionId ? <input type="hidden" name="section_id" value={sectionId} /> : <Field as="select" name="section_id" label="Section" options={withNone(sections ?? [], "Choose…")} required />}
    </>
  )
}

// --- Enrollment ---------------------------------------------------------------------------
export function EnrollmentFields({
  yearId,
  grades,
  sections,
  student,
}: {
  yearId: string
  grades: Option[]
  sections: Option[]
  /** Fixed student (from the student profile); otherwise a picker is shown. */
  student?: PickerOption
}) {
  return (
    <>
      <input type="hidden" name="academic_year_id" value={yearId} />
      {student ? <input type="hidden" name="student_id" value={student.id} /> : <RecordPicker name="student_id" label="Student" entity="students" required />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field as="select" name="grade_level_id" label="Grade level" options={withNone(grades, "Choose…")} required />
        <Field as="select" name="section_id" label="Section" options={withNone(sections, "Assign later")} />
      </div>
      <Field name="enrollment_date" label="Enrollment date" type="date" defaultValue={today()} required />
    </>
  )
}

export function AssignSectionFields({ sections }: { sections: Option[] }) {
  return <Field as="select" name="section_id" label="Section" options={withNone(sections, "Choose…")} required />
}

export function TransferFields({ grades, sections, gradeId }: { grades: Option[]; sections: Option[]; gradeId: string }) {
  return (
    <>
      <p className="text-sm text-muted">The current placement is closed as “transferred” and kept in the history; a new placement starts on the effective date.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field as="select" name="grade_level_id" label="Grade level" defaultValue={gradeId} options={grades} required />
        <Field as="select" name="section_id" label="New section" options={withNone(sections, "No section yet")} />
      </div>
      <Field name="effective_date" label="Effective date" type="date" defaultValue={today()} required />
    </>
  )
}

export function CloseEnrollmentFields() {
  return (
    <>
      <p className="text-sm text-muted">Closed enrollments become part of the student&apos;s permanent history and cannot be edited.</p>
      <Field
        as="select"
        name="enrollment_status"
        label="Reason"
        options={[
          { value: "completed", label: "Completed the year" },
          { value: "transferred", label: "Transferred to another school" },
          { value: "withdrawn", label: "Withdrawn" },
        ]}
        required
      />
      <Field name="exit_date" label="Exit date" type="date" defaultValue={today()} required />
    </>
  )
}

// --- Guardians ------------------------------------------------------------------------------
const RELATIONSHIP_OPTIONS: Option[] = [
  { value: "mother", label: "Mother" },
  { value: "father", label: "Father" },
  { value: "guardian", label: "Guardian" },
  { value: "grandparent", label: "Grandparent" },
  { value: "sibling", label: "Sibling" },
  { value: "other", label: "Other" },
]

export function GuardianLinkFields({
  link,
  studentId,
  guardianId,
}: {
  link?: StudentGuardian
  /** Exactly one of studentId / guardianId is fixed when creating; the other is picked. */
  studentId?: string
  guardianId?: string
}) {
  return (
    <>
      {!link && (studentId ? <input type="hidden" name="student_id" value={studentId} /> : <RecordPicker name="student_id" label="Student" entity="students" required />)}
      {!link && (guardianId ? <input type="hidden" name="guardian_id" value={guardianId} /> : <RecordPicker name="guardian_id" label="Parent / guardian" entity="guardians" required />)}
      <Field as="select" name="relationship_type" label="Relationship" defaultValue={link?.relationship_type ?? "guardian"} options={RELATIONSHIP_OPTIONS} required />
      <div className="space-y-2">
        <CheckboxField name="is_primary" label="Primary contact" defaultChecked={link?.is_primary} hint="Replaces the student's current primary contact." />
        <CheckboxField name="can_pickup" label="Allowed to pick up the student" defaultChecked={link?.can_pickup} />
        <CheckboxField name="can_receive_notifications" label="Receives school notifications" defaultChecked={link?.can_receive_notifications ?? true} />
      </div>
    </>
  )
}

// --- People (full-page forms) ------------------------------------------------------------------
type FormAction = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>

function FormActions({ cancelHref, label }: { cancelHref: string; label: string }) {
  return (
    <div className="flex justify-end gap-2 border-t border-border pt-4">
      <LinkButton href={cancelHref} variant="secondary">
        Cancel
      </LinkButton>
      <SubmitButton>{label}</SubmitButton>
    </div>
  )
}

function NameFields({ p }: { p?: { first_name: string; middle_name: string | null; last_name: string } }) {
  return (
    <>
      <Field name="first_name" label="First name" defaultValue={p?.first_name} required />
      <Field name="middle_name" label="Middle name" defaultValue={p?.middle_name ?? ""} />
      <Field name="last_name" label="Last name" defaultValue={p?.last_name} required />
    </>
  )
}

const section = (title: string, children: React.ReactNode) => (
  <fieldset className="space-y-4">
    <legend className="mb-2 text-sm font-semibold">{title}</legend>
    <div className="grid gap-4 md:grid-cols-3">{children}</div>
  </fieldset>
)

export function StudentForm({ action, student, cancelHref }: { action: FormAction; student?: Student; cancelHref: string }) {
  return (
    <Form action={action} className="space-y-6">
      {section(
        "Personal information",
        <>
          <Field name="student_number" label="Student number" defaultValue={student?.student_number} required />
          <NameFields p={student} />
          <Field name="suffix" label="Suffix" placeholder="Jr." defaultValue={student?.suffix ?? ""} />
          <Field name="date_of_birth" label="Date of birth" type="date" defaultValue={student?.date_of_birth ?? ""} />
          <Field
            as="select"
            name="gender"
            label="Gender"
            defaultValue={student?.gender ?? ""}
            options={[
              { value: "", label: "Not specified" },
              { value: "female", label: "Female" },
              { value: "male", label: "Male" },
              { value: "other", label: "Other" },
              { value: "unspecified", label: "Prefer not to say" },
            ]}
          />
        </>
      )}
      {section(
        "Contact information",
        <>
          <Field name="email" label="Email" type="email" defaultValue={student?.email ?? ""} hint="Needed to invite the student to the app." />
          <Field name="phone" label="Phone" type="tel" defaultValue={student?.phone ?? ""} />
          <Field name="address" label="Address" as="textarea" defaultValue={student?.address ?? ""} className="md:col-span-3" />
        </>
      )}
      {section(
        "Record",
        <Field
          as="select"
          name="status"
          label="Status"
          defaultValue={student?.status ?? "active"}
          options={[
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
            { value: "graduated", label: "Graduated" },
            { value: "transferred", label: "Transferred" },
            { value: "withdrawn", label: "Withdrawn" },
          ]}
        />
      )}
      <FormActions cancelHref={cancelHref} label={student ? "Save student" : "Create student"} />
    </Form>
  )
}

export function TeacherForm({ action, teacher, cancelHref }: { action: FormAction; teacher?: Teacher; cancelHref: string }) {
  return (
    <Form action={action} className="space-y-6">
      {section("Personal information", <NameFields p={teacher} />)}
      {section(
        "Contact information",
        <>
          <Field name="email" label="Email" type="email" defaultValue={teacher?.email ?? ""} hint="Needed to invite the teacher to the app." />
          <Field name="phone" label="Phone" type="tel" defaultValue={teacher?.phone ?? ""} />
        </>
      )}
      {section(
        "Employment",
        <>
          <Field name="employee_number" label="Employee number" defaultValue={teacher?.employee_number ?? ""} />
          <Field name="specialization" label="Specialization" defaultValue={teacher?.specialization ?? ""} />
          <Field
            as="select"
            name="status"
            label="Status"
            defaultValue={teacher?.status ?? "active"}
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
              { value: "resigned", label: "Resigned" },
              { value: "retired", label: "Retired" },
            ]}
            hint="Teachers who are not active lose access to their classes."
          />
        </>
      )}
      <FormActions cancelHref={cancelHref} label={teacher ? "Save teacher" : "Create teacher"} />
    </Form>
  )
}

export function GuardianForm({ action, guardian, cancelHref }: { action: FormAction; guardian?: Guardian; cancelHref: string }) {
  return (
    <Form action={action} className="space-y-6">
      {section(
        "Personal information",
        <>
          <NameFields p={guardian} />
          <Field name="occupation" label="Occupation" defaultValue={guardian?.occupation ?? ""} />
        </>
      )}
      {section(
        "Contact information",
        <>
          <Field name="email" label="Email" type="email" defaultValue={guardian?.email ?? ""} hint="Needed to invite the parent to the app." />
          <Field name="phone" label="Phone" type="tel" defaultValue={guardian?.phone ?? ""} />
          <Field
            as="select"
            name="status"
            label="Status"
            defaultValue={guardian?.status ?? "active"}
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
          />
          <Field name="address" label="Address" as="textarea" defaultValue={guardian?.address ?? ""} className="md:col-span-3" />
        </>
      )}
      <FormActions cancelHref={cancelHref} label={guardian ? "Save" : "Create parent / guardian"} />
    </Form>
  )
}
