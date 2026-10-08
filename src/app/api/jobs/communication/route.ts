import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { runCommunicationJobs } from "@/server/notifications/dispatcher"

/**
 * Communication worker endpoint, called by a scheduler (Vercel Cron, pg_cron +
 * pg_net, or any external cron) — never by browsers. Requires
 * `Authorization: Bearer <CRON_SECRET>`.
 *
 * Scheduled announcements are ALSO published by pg_cron inside the database
 * every minute, so they do not depend on this endpoint; this endpoint is what
 * sends email/SMS/push through the configured providers.
 */
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? ""
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  try {
    return NextResponse.json(await runCommunicationJobs())
  } catch (e) {
    console.error("[jobs/communication]", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "job_failed" }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
