"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { createHash } from "node:crypto"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { fail, formToObject, invalid, type ActionResult } from "@/lib/action-result"
import { safeRedirectPath } from "@/lib/utils"
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from "@/lib/validations"

async function siteOrigin() {
  const h = await headers()
  return process.env.NEXT_PUBLIC_SITE_URL || h.get("origin") || `https://${h.get("host")}`
}

/**
 * The visitor's address as reported by the hosting proxy (Vercel sets
 * x-forwarded-for / x-real-ip). Hashed before it is stored.
 */
async function clientKey() {
  const h = await headers()
  const ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  return createHash("sha256").update(ip).digest("hex").slice(0, 32)
}

/** Shared (database) counter: works across every server instance. Fails open if the check itself errors. */
async function withinLimit(action: string, limit: number, windowSeconds: number) {
  const { data, error } = await createAdminClient().rpc("hit_rate_limit", {
    p_bucket: `${action}:${await clientKey()}`,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })
  if (error) {
    console.error("[rateLimit]", error.code, error.message)
    return true
  }
  return data === true
}

export async function signIn(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(formToObject(formData))
  if (!parsed.success) return invalid(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { ok: false, error: "Please confirm your email address first. Check your inbox for the link." }
    }
    if (error.status && error.status >= 500) return fail(error, "signIn")
    // Same message for unknown email and wrong password (no account enumeration).
    return { ok: false, error: "Invalid email or password." }
  }
  redirect(safeRedirectPath(formData.get("next") as string | null))
}

export async function register(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = registerSchema.safeParse(formToObject(formData))
  if (!parsed.success) return invalid(parsed.error)
  const { email, password, first_name, last_name, school_code, requested_role } = parsed.data

  // School codes are not public: limit guesses per visitor (10 per 15 minutes).
  if (!(await withinLimit("register", 10, 900))) {
    return { ok: false, error: "Too many attempts. Please wait a few minutes and try again." }
  }
  // Server-only check (the public API no longer answers it).
  const { data: codeOk, error: codeError } = await createAdminClient().rpc("school_code_is_valid", { school_code })
  if (codeError) return fail(codeError, "register.code")
  if (!codeOk) {
    return {
      ok: false,
      error: "Please correct the highlighted fields.",
      fieldErrors: { school_code: ["No active school uses this code"] },
    }
  }

  // Metadata is user-controlled: the database trigger only accepts a valid
  // school code and non-admin roles, and always starts the account as pending.
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { first_name, last_name, school_code, requested_role },
      emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=/account-status`,
    },
  })
  if (error) {
    if (error.code === "user_already_exists") {
      return { ok: false, error: "An account with this email already exists. Try signing in instead." }
    }
    if (error.code === "weak_password") {
      return { ok: false, error: "Please choose a stronger password.", fieldErrors: { password: [error.message] } }
    }
    return fail(error, "register")
  }

  // With email confirmation enabled there is no session until the link is clicked.
  if (!data.session) {
    return { ok: true, message: "Check your email for a confirmation link to finish registering." }
  }
  redirect("/account-status")
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}

export async function requestPasswordReset(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(formToObject(formData))
  if (!parsed.success) return invalid(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await siteOrigin()}/auth/confirm?next=/reset-password`,
  })
  if (error) console.error("[requestPasswordReset]", error.code, error.message)

  // Always report success so the form cannot be used to discover accounts.
  return { ok: true, message: "If an account exists for that email, a password reset link has been sent." }
}

/** Sets a new password. Requires a session (from the reset link, or signed in). */
export async function updatePassword(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(formToObject(formData))
  if (!parsed.success) return invalid(parsed.error)

  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) return { ok: false, error: "Your link has expired. Please request a new one." }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    if (error.code === "same_password") {
      return { ok: false, error: "Choose a password different from your current one." }
    }
    return fail(error, "updatePassword")
  }
  return { ok: true, message: "Your password has been updated." }
}

/** Invited user sets their password, then the invitation is marked accepted. */
export async function acceptInvitation(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(formToObject(formData))
  if (!parsed.success) return invalid(parsed.error)

  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) return { ok: false, error: "Your invitation link has expired. Ask your school to send a new one." }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error && error.code !== "same_password") return fail(error, "acceptInvitation")
  const { error: rpcError } = await supabase.rpc("accept_invitation")
  if (rpcError) return fail(rpcError, "acceptInvitation.rpc")
  redirect("/dashboard")
}
