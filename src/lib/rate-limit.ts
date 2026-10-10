import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Shared (database) counter: works across every server instance. Returns
 * false once `bucket` was hit more than `limit` times in the window.
 * Fails open if the check itself errors.
 */
export async function hitRateLimit(bucket: string, limit: number, windowSeconds: number) {
  const { data, error } = await createAdminClient().rpc("hit_rate_limit", {
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })
  if (error) {
    console.error("[rateLimit]", error.code, error.message)
    return true
  }
  return data === true
}

/** Hits already recorded for `bucket` in the current window (does not add one). */
export async function rateLimitHits(bucket: string, windowSeconds: number) {
  const { data, error } = await createAdminClient().rpc("rate_limit_hits", { p_bucket: bucket, p_window_seconds: windowSeconds })
  if (error) {
    console.error("[rateLimitHits]", error.code, error.message)
    return 0
  }
  return (data as number | null) ?? 0
}
