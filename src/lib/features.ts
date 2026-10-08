import "server-only"
import { notFound } from "next/navigation"
import { requireActiveUser } from "@/lib/auth/session"
import { hasFeature } from "@/services/features"

/** Display names for feature keys (the database catalog is the source of truth). */
export const FEATURE_LABELS: Record<string, string> = {
  sms: "SMS",
  payments: "Payments",
  library: "Library",
  inventory: "Inventory",
  online_enrollment: "Online Enrollment",
  advanced_reports: "Advanced Reports",
  parent_portal: "Parent Portal",
  notifications: "Notifications",
}

/**
 * Gate a page, route handler or action behind a school feature flag.
 * The check runs in the database (has_feature RPC) for the caller's own school,
 * so it cannot be bypassed by calling a URL directly. Responds 404 when off.
 * Future module tables must ALSO gate their RLS with private.school_has_feature().
 */
export async function requireFeature(featureKey: string) {
  const ctx = await requireActiveUser()
  if (!(await hasFeature(featureKey))) notFound()
  return ctx
}
