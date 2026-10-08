import { z } from "zod"

const blankToNull = (v: unknown) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v)
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blankToNull, schema.nullable())
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean())
const id = z.uuid("Choose an option")
const date = z.iso.date("Enter a valid date")
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)")
const text = (label: string, max: number) => z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long`)
const score = z.coerce.number({ error: "Enter a number" }).min(0, "Cannot be negative").max(1000)

export const gradingPeriodSchema = z
  .object({
    name: text("Name", 60),
    code: z.string().trim().regex(/^[A-Za-z0-9_-]{1,20}$/, "Use 1–20 letters, numbers, dashes or underscores"),
    sequence: z.coerce.number().int("Use a whole number").min(1).max(20),
    start_date: date,
    end_date: date,
  })
  .refine((v) => v.start_date < v.end_date, { path: ["end_date"], message: "End date must be after the start date" })

export const gradingScaleSchema = z
  .object({
    name: text("Name", 60),
    minimum_score: score,
    maximum_score: score,
    equivalent: optional(z.string().trim().max(20)),
    description: optional(z.string().trim().max(500)),
    is_passing: checkbox,
  })
  .refine((v) => v.minimum_score <= v.maximum_score, { path: ["maximum_score"], message: "Must be at least the minimum" })

export const scheduleSchema = z
  .object({
    teaching_load_id: id,
    day_of_week: z.coerce.number().int().min(1).max(7),
    start_time: time,
    end_time: time,
    room: optional(z.string().trim().max(60)),
  })
  .refine((v) => v.start_time < v.end_time, { path: ["end_time"], message: "End time must be after the start time" })

export const ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"] as const

export const attendanceSheetSchema = z.object({
  section_id: id,
  date,
  records: z
    .array(z.object({ enrollment_id: id, status: z.enum(ATTENDANCE_STATUSES), remarks: optional(z.string().trim().max(500)) }))
    .max(500),
})

export const gradeSheetSchema = z.object({
  load_id: id,
  period_id: id,
  submit: z.boolean(),
  entries: z
    .array(z.object({ enrollment_id: id, score: z.number().min(0).max(1000).nullable(), remarks: optional(z.string().trim().max(500)) }))
    .max(500),
})

export const reviewSchema = z.object({
  ids: z.array(id).min(1, "Select at least one grade").max(2000),
  action: z.enum(["approve", "return", "lock", "unlock"]),
  reason: optional(z.string().trim().max(500)),
})

export const gradeEditSchema = z.object({
  score,
  remarks: optional(z.string().trim().max(500)),
  reason: text("Reason", 500),
})

export const courseworkSchema = z.object({
  load_id: id,
  title: text("Title", 200),
  description: optional(z.string().trim().max(10000)),
  due_at: optional(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Enter a valid date and time")),
  status: z.enum(["draft", "published"]),
})

export const courseworkUpdateSchema = courseworkSchema.omit({ load_id: true }).extend({
  status: z.enum(["draft", "published", "archived"]),
})

export const submissionSchema = z
  .object({
    content: optional(z.string().trim().max(20000)),
    file_path: optional(z.string().max(500)),
    file_name: optional(z.string().max(255)),
  })
  .refine((v) => v.content || v.file_path, { path: ["content"], message: "Write an answer or attach a file" })

export const academicSettingsSchema = z
  .object({
    attendance_edit_days: optional(z.coerce.number().int("Use a whole number").min(0).max(365)),
    enforce_room_conflicts: checkbox,
    grade_max_score: z.coerce.number().positive().max(1000),
    grade_passing_score: z.coerce.number().min(0).max(1000),
  })
  .refine((v) => v.grade_passing_score <= v.grade_max_score, { path: ["grade_passing_score"], message: "Cannot exceed the maximum score" })
