import { NextResponse } from "next/server"
import { authorize } from "@/lib/auth/session"
import { likePattern, orIlike } from "@/lib/list-params"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /api/lookups/:entity?q= — at most 10 matches for record pickers.
 * School admins only; scoped to their school (and by RLS).
 */
export async function GET(request: Request, { params }: RouteContext<"/api/lookups/[entity]">) {
  const { entity } = await params
  if (entity === "users") return lookupUsers(request)
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

/** Active login accounts of the admin's school (announcement "specific person" targets). */
async function lookupUsers(request: Request) {
  const ctx = await authorize("school.records.manage")
  if (!ctx?.profile.school_id) return NextResponse.json({ error: "forbidden" }, { status: 403 })
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 100)
  const supabase = await createClient()
  let query = supabase.from("profiles").select("user_id, first_name, last_name, email, role").eq("school_id", ctx.profile.school_id).eq("status", "active")
  if (q) query = query.or(orIlike(["first_name", "last_name", "email"], q))
  const { data, error } = await query.order("last_name").limit(10)
  if (error) return NextResponse.json({ error: "lookup_failed" }, { status: 500 })
  return NextResponse.json((data ?? []).map((p) => ({ id: p.user_id, label: `${p.last_name}, ${p.first_name}`.replace(/^, |, $/, "") || p.email, detail: `${p.role.replace("_", " ")} · ${p.email}` })))
}
