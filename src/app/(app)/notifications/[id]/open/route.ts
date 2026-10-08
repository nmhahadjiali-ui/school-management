import { NextResponse } from "next/server"
import { getUserContext } from "@/lib/auth/session"
import { deepLink, getNotification, setNotificationsRead } from "@/services/communication"

/**
 * GET /notifications/:id/open — used by the bell, the center, and links in
 * emails/push. Loads the notification AS THE CALLER (RLS: only their own),
 * marks it read and redirects to its target. The target page performs its own
 * authorization, so a tampered payload can only lead to a 404.
 */
export async function GET(request: Request, { params }: RouteContext<"/notifications/[id]/open">) {
  const { id } = await params
  const origin = new URL(request.url).origin
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.redirect(new URL(`/login?next=/notifications/${encodeURIComponent(id)}/open`, origin))
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.redirect(new URL("/notifications", origin))

  const { data: n } = await getNotification(id)
  if (!n) return NextResponse.redirect(new URL("/notifications", origin))
  if (!n.read_at) await setNotificationsRead([n.id], true)
  return NextResponse.redirect(new URL(deepLink(n.type, n.data), origin))
}
