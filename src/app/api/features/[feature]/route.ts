import { NextResponse } from "next/server"
import { getUserContext } from "@/lib/auth/session"
import { hasFeature } from "@/services/features"

/**
 * GET /api/features/:feature — example of a feature-gated API endpoint.
 * 401 when signed out, 403 when inactive or the feature is disabled for the
 * caller's school, 200 otherwise. Future module endpoints follow this pattern.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/features/[feature]">) {
  const { feature } = await params
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (!ctx.access_active || !(await hasFeature(feature))) {
    return NextResponse.json({ error: "feature_unavailable" }, { status: 403 })
  }
  return NextResponse.json({ feature, enabled: true })
}
