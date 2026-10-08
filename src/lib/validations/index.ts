import { z } from "zod"
import { PROVISIONABLE_ROLES, SCHOOL_MEMBER_ROLES } from "@/lib/auth/permissions"

/** Empty string -> null, otherwise validated by `schema`. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v), schema.nullable())

const name = (label: string) => z.string().trim().min(1, `${label} is required`).max(100)
const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address"))
const password = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(72, "Use at most 72 characters")
  .regex(/[A-Za-z]/, "Include at least one letter")
  .regex(/[0-9]/, "Include at least one number")
const httpUrl = z.url({ protocol: /^https?$/, message: "Enter a full URL starting with https://" })
const timezone = z
  .string()
  .trim()
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz })
      return true
    } catch {
      return false
    }
  }, "Choose a valid time zone")

// --- Auth ------------------------------------------------------------------
export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required"),
})

export const registerSchema = z
  .object({
    first_name: name("First name"),
    last_name: name("Last name"),
    email,
    school_code: z.string().trim().toUpperCase().min(2, "School code is required").max(20),
    requested_role: z.enum(SCHOOL_MEMBER_ROLES, "Choose a role"),
    password,
    confirm_password: z.string(),
  })
  .refine((v) => v.password === v.confirm_password, {
    path: ["confirm_password"],
    message: "Passwords do not match",
  })

export const forgotPasswordSchema = z.object({ email })

export const resetPasswordSchema = z
  .object({ password, confirm_password: z.string() })
  .refine((v) => v.password === v.confirm_password, {
    path: ["confirm_password"],
    message: "Passwords do not match",
  })

// --- Schools ---------------------------------------------------------------
const schoolDetails = {
  name: z.string().trim().min(2, "School name is required").max(200),
  address: optional(z.string().max(500)),
  contact_email: optional(email),
  contact_phone: optional(z.string().max(40)),
  logo_url: optional(httpUrl),
  timezone,
}

export const createSchoolSchema = z.object({
  ...schoolDetails,
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/, "2–20 letters, numbers or dashes"),
  status: z.enum(["active", "inactive"]).default("active"),
})

export const updateSchoolSchema = z.object(schoolDetails)

// --- Users -----------------------------------------------------------------
export const provisionUserSchema = z.object({
  first_name: name("First name"),
  last_name: name("Last name"),
  email,
  role: z.enum(PROVISIONABLE_ROLES, "Choose a role"),
  password,
})

export const updateMemberSchema = z.object({
  // Omitted when only the status changes (e.g. deactivating a school admin).
  role: z.enum(SCHOOL_MEMBER_ROLES, "Choose a role").optional(),
  status: z.enum(["pending", "active", "inactive"]),
})

export const updateProfileSchema = z.object({
  first_name: name("First name"),
  last_name: name("Last name"),
  phone: optional(z.string().max(40)),
  avatar_url: optional(httpUrl),
})

// --- Settings --------------------------------------------------------------
// Academic years are managed in academic_years (Phase 2), not in settings.
export const schoolSettingsSchema = z.object({
  timezone,
  logo_url: optional(httpUrl),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color such as #1d4ed8"),
})

export const uuidSchema = z.uuid()
