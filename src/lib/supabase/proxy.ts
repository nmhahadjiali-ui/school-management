import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

/** Routes reachable without a session. Everything else requires sign-in. */
const PUBLIC_PATHS = ["/login", "/register", "/forgot-password", "/auth"]
/** Pages a signed-in user has no reason to see. */
const GUEST_ONLY_PATHS = ["/login", "/register", "/forgot-password"]

const matches = (pathname: string, paths: string[]) =>
  paths.some((p) => pathname === p || pathname.startsWith(`${p}/`))

/**
 * Refreshes the Supabase session cookie on every request and performs
 * optimistic route protection. This is a UX layer only: pages, server actions
 * and RLS each re-check authorization.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  // Do not run code between createServerClient and getClaims().
  const { data } = await supabase.auth.getClaims()
  const isSignedIn = Boolean(data?.claims?.sub)
  const { pathname, searchParams } = request.nextUrl

  const redirectTo = (path: string, params: Record<string, string> = {}) => {
    const url = request.nextUrl.clone()
    url.pathname = path
    url.search = ""
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    const redirect = NextResponse.redirect(url)
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c))
    return redirect
  }

  if (!isSignedIn && pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  if (!isSignedIn && !matches(pathname, PUBLIC_PATHS)) {
    const params: Record<string, string> = {}
    if (pathname !== "/") params.next = pathname + request.nextUrl.search
    // An auth cookie that no longer yields a valid session means it expired.
    if (request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"))) {
      params.reason = "expired"
    }
    return redirectTo("/login", params)
  }

  if (isSignedIn && matches(pathname, GUEST_ONLY_PATHS) && !searchParams.has("error")) {
    return redirectTo("/dashboard")
  }

  return response
}
