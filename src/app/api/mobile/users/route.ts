import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { denied } from "@/lib/action-result"
import { provisionUserAs } from "@/lib/users/provision"
import type { UserContext } from "@/types/domain"

/**
 * POST /api/mobile/users — create an account from the mobile app.
 *
 * The app has no cookies: it sends its Supabase access token as
 * `Authorization: Bearer <token>`. The token is verified, then everything runs
 * AS THAT USER (RLS) through the same rules as the web form
 * (`provisionUserAs`). Body: { school_id, first_name, last_name, email, role, password }.
 */
export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1]
  if (!token) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 })

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: claims } = await supabase.auth.getClaims(token)
  if (!claims?.claims?.sub) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 })
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 })

  const { data: ctx, error } = await supabase.rpc("get_my_context")
  if (error) {
    console.error("[api/mobile/users]", error.code, error.message)
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 })
  }

  const { school_id, ...input } = body
  const result = await provisionUserAs(ctx as UserContext | null, supabase, String(school_id ?? ""), input)
  const status = result.ok ? 201 : result.error === denied().error ? 403 : 400
  return NextResponse.json(result, { status })
}
