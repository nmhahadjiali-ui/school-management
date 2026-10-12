import "server-only"
import { createClient as createPlainClient } from "@supabase/supabase-js"
import type { ActionResult } from "@/lib/action-result"
import { hitRateLimit, rateLimitHits } from "@/lib/rate-limit"

/** True when `password` is the signed-in user's password. Uses a throwaway session, revoked at once. */
async function passwordMatches(email: string, password: string) {
  const verifier = createPlainClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await verifier.auth.signInWithPassword({ email, password })
  if (error) return false
  await verifier.auth.signOut({ scope: "local" })
  return true
}

/**
 * Re-confirm the signed-in admin's password before a permanent action.
 * Wrong passwords are limited per account (5 per 15 minutes); correct ones
 * never count. Returns null when confirmed, otherwise the error to show.
 */
export async function confirmPassword(profile: { id: string; email: string }, password: unknown): Promise<ActionResult | null> {
  if (typeof password !== "string" || password.length === 0 || password.length > 72) {
    return { ok: false, error: "Enter your password to confirm.", fieldErrors: { password: ["Enter your password"] } }
  }
  const bucket = `delete-confirm-failed:${profile.id}`
  const tooMany = { ok: false as const, error: "Too many incorrect passwords. Please wait 15 minutes and try again." }
  if ((await rateLimitHits(bucket, 900)) >= 5) return tooMany
  if (!(await passwordMatches(profile.email, password))) {
    if (!(await hitRateLimit(bucket, 5, 900))) return tooMany
    return { ok: false, error: "That password is not correct.", fieldErrors: { password: ["Incorrect password"] } }
  }
  return null
}
