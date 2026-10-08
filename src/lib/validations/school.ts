import { z } from "zod"

// Form input arrives as strings. These helpers normalise blanks and checkboxes.
const blankToNull = (v: unknown) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v)
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blankToNull, schema.nullable())
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean())

const text = (label: string, max: number) => z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long`)
const code = z.string().trim().regex(/^[A-Za-z0-9_-]{1,20}$/, "Use 1–20 letters, numbers, dashes or underscores")
const date = z.iso.date("Enter a valid date")
const id = z.uuid("Choose an option")
const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address"))
const phone = optional(z.string().trim().max(40, "Phone is too long"))
const url = optional(z.url({ protocol: /^https?$/, message: "Enter a full URL starting with https://" }))
const person = {
  first_name: text("First name", 100),
  middle_name: optional(z.string().trim().max(100)),
  last_name: text("Last name", 100),
}

const beforeOrToday = (d: string | null) => !d || d <= new Date().toISOString().slice(0, 10)

// --- Academic structure --------------------------------------------------------
export const academicYearSchema = z
  .object({ name: text("Name", 50), start_date: date, end_date: date })
  .refine((v) => v.start_date < v.end_date, { path: ["end_date"], message: "End date must be after the start date" })

export const gradeLevelSchema = z.object({
  name: text("Name", 60),
  code,
  sort_order: z.coerce.number().int("Use a whole number").min(-1000).max(1000),
})

export const subjectSchema = z.object({
  name: text("Name", 100),
  code,
  description: optional(z.string().trim().max(1000)),
})

export const sectionSchema = z.object({
  academic_year_id: id,
  grade_level_id: id,
  name: text("Name", 60),
  code: optional(code),
  capacity: optional(z.coerce.number().int("Use a whole number").min(1, "At least 1").max(1000)),
  room: optional(z.string().trim().max(60)),
  adviser_teacher_id: optional(id),
})

// --- People ------------------------------------------------------------------------
export const studentSchema = z.object({
  student_number: text("Student number", 50),
  ...person,
  suffix: optional(z.string().trim().max(20)),
  date_of_birth: optional(date).refine(beforeOrToday, "Date of birth cannot be in the future"),
  gender: optional(z.enum(["male", "female", "other", "unspecified"])),
  email: optional(email),
  phone,
  address: optional(z.string().trim().max(500)),
  photo_url: url,
  status: z.enum(["active", "inactive", "graduated", "transferred", "withdrawn"]),
})

export const teacherSchema = z.object({
  employee_number: optional(z.string().trim().max(50)),
  ...person,
  email: optional(email),
  phone,
  specialization: optional(z.string().trim().max(200)),
  status: z.enum(["active", "inactive", "resigned", "retired"]),
})

export const guardianSchema = z.object({
  ...person,
  email: optional(email),
  phone,
  address: optional(z.string().trim().max(500)),
  occupation: optional(z.string().trim().max(100)),
  status: z.enum(["active", "inactive"]),
})

export const RELATIONSHIPS = ["mother", "father", "guardian", "grandparent", "sibling", "other"] as const

export const guardianLinkSchema = z.object({
  student_id: id,
  guardian_id: id,
  relationship_type: z.enum(RELATIONSHIPS, "Choose a relationship"),
  is_primary: checkbox,
  can_pickup: checkbox,
  can_receive_notifications: checkbox,
})

export const guardianLinkUpdateSchema = guardianLinkSchema.omit({ student_id: true, guardian_id: true })

// --- Enrollment and assignments -------------------------------------------------------
export const enrollmentSchema = z.object({
  student_id: id,
  academic_year_id: id,
  grade_level_id: id,
  section_id: optional(id),
  enrollment_date: date,
})

export const transferSchema = z.object({
  grade_level_id: id,
  section_id: optional(id),
  effective_date: date,
})

export const closeEnrollmentSchema = z.object({
  enrollment_status: z.enum(["completed", "transferred", "withdrawn"]),
  exit_date: date,
})

export const assignSectionSchema = z.object({ section_id: id })

export const assignmentSchema = z.object({
  academic_year_id: id,
  teacher_id: id,
  subject_id: id,
  section_id: id,
})

export const linkAccountSchema = z.object({ user_id: z.uuid("Choose an account") })
