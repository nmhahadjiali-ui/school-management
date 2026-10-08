import type { ZodError } from "zod"

/** Uniform return type for Server Actions consumed by forms. */
export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }

export const GENERIC_ERROR = "Something went wrong. Please try again."

type DbError = { code?: string; message?: string } | null | undefined

/**
 * Translate a database error into a friendly message. Technical details are
 * logged on the server only and never sent to the browser.
 */
export function fail(error: DbError, context: string): { ok: false; error: string } {
  console.error(`[${context}]`, error?.code, error?.message)
  switch (error?.code) {
    case "23505":
      return { ok: false, error: "A record with the same value already exists." }
    case "23503":
      return { ok: false, error: "This record is linked to other records and cannot be changed this way." }
    case "23514":
      return { ok: false, error: "One of the values is not valid." }
    case "42501":
      return { ok: false, error: "You do not have permission to do that." }
    case "PGRST116":
      return { ok: false, error: "The record was not found or you do not have access to it." }
    default:
      return { ok: false, error: GENERIC_ERROR }
  }
}

export function invalid(error: ZodError): { ok: false; error: string; fieldErrors: Record<string, string[]> } {
  const fieldErrors: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form"
    ;(fieldErrors[key] ??= []).push(issue.message)
  }
  return { ok: false, error: "Please correct the highlighted fields.", fieldErrors }
}

export const denied = (): { ok: false; error: string } => ({
  ok: false,
  error: "You do not have permission to do that.",
})

/** Read FormData into a plain object of trimmed strings (React's internal `$ACTION_*` keys skipped). */
export function formToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string" && !k.startsWith("$")) out[k] = v.trim()
  }
  return out
}
