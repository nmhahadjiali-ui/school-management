import { NextResponse } from "next/server"
import { getUserContext } from "@/lib/auth/session"
import { ANY_PHOTO_PATH } from "@/lib/images"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /api/photos?path=<storage path> — redirects to a short-lived signed URL
 * for a profile or student photo. The URL is signed with the CALLER's session,
 * so Storage RLS decides access: someone who cannot see the student (or the
 * user) gets 404, whatever path they guess.
 */
export async function GET(request: Request) {
  const ctx = await getUserContext()
  if (!ctx?.access_active) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const path = new URL(request.url).searchParams.get("path") ?? ""
  if (!ANY_PHOTO_PATH.test(path)) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const supabase = await createClient()
  const { data, error } = await supabase.storage.from("photos").createSignedUrl(path, 600)
  if (error || !data?.signedUrl) return NextResponse.json({ error: "not_found" }, { status: 404 })
  // Browsers may reuse the redirect for 5 minutes (the signed URL lives 10).
  return NextResponse.redirect(data.signedUrl, { status: 302, headers: { "cache-control": "private, max-age=300" } })
}
