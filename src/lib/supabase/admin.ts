import "server-only"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"

/**
 * Service-role client. BYPASSES Row Level Security.
 *
 * Only for operations the Data API cannot do as the user (creating Auth users).
 * Callers MUST authorize the request first. Never import this from client code
 * (the "server-only" import makes that a build error).
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured")
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
