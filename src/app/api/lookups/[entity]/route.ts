import { NextResponse } from "next/server"
import { authorize } from "@/lib/auth/session"
import { likePattern } from "@/lib/list-params"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /api/lookups/:entity?q= — at most 10 matches for record pickers.
 * School admins only; scoped to their school (and by RLS).
 */
export async function GET(request: Request, { params }: RouteContext<"/api/lookups/[entity]">) {
  const { entity } = await params
  if (entity !== "students" && entity !== "guardians" && entity !== "teachers") {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  const ctx = await authorize("school.records.manage")
  if (!ctx?.profile.school_id) return NextResponse.json({ error: "forbidden" }, { status: 403 })

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 100)
  const supabase = await createClient()
  const columns = entity === "students" ? "id, first_name, last_name, student_number" : entity === "teachers" ? "id, first_name, last_name, employee_number" : "id, first_name, last_name, email"
  let query = supabase.from(entity).select(columns).eq("school_id", ctx.profile.school_id).eq("status", "active")
  if (q) query = query.ilike("search_text", likePattern(q))
  const { data, error } = await query.order("last_name").order("first_name").limit(10)
  if (error) {
    console.error("[lookups]", error.code, error.message)
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 })
  }
  const rows = (data ?? []) as unknown as Record<string, string | null>[]
  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      label: `${r.last_name}, ${r.first_name}`,
      detail: r.student_number ?? r.employee_number ?? r.email ?? undefined,
    }))
  )
}
