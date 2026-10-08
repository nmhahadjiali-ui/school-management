import { NextResponse, type NextRequest } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { safeRedirectPath } from "@/lib/utils"

/**
 * Landing route for Supabase auth email links (sign-up confirmation, password
 * reset). Supports both the PKCE `code` flow and `token_hash` templates.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const next = safeRedirectPath(searchParams.get("next"))
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null

  const supabase = await createClient()
  let error: { message: string } | null = null
  if (code) {
    ;({ error } = await supabase.auth.exchangeCodeForSession(code))
  } else if (tokenHash && type) {
    ;({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }))
  } else {
    error = { message: "missing code" }
  }

  if (!error) return NextResponse.redirect(`${origin}${next}`)
  console.error("[auth/confirm]", error.message)
  return NextResponse.redirect(`${origin}/login?error=link`)
}
