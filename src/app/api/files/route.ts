import { NextResponse } from "next/server"
import { getUserContext } from "@/lib/auth/session"
import { signedFileUrl } from "@/services/operations"

/**
 * GET /api/files?path=<storage path> — redirects to a 60-second signed URL.
 * Storage RLS (evaluated as the caller) decides access, so a guessed path for
 * another school's file returns 404.
 */
export async function GET(request: Request) {
  const ctx = await getUserContext()
  if (!ctx?.access_active) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const path = new URL(request.url).searchParams.get("path") ?? ""
  if (!/^[0-9a-f-]{36}\/(assignments|submissions)\/[\w\-/. ]+$/i.test(path) || path.includes("..")) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  const { data, error } = await signedFileUrl(path)
  if (error || !data?.signedUrl) return NextResponse.json({ error: "not_found" }, { status: 404 })
  return NextResponse.redirect(data.signedUrl, { status: 302 })
}
