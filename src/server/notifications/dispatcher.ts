import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { getProviders, type SendResult } from "@/server/notifications/providers"

// =============================================================================
// Server-side delivery worker. Runs from the job endpoint (cron), never from
// the browser. It drains the notification_deliveries queue:
//   claim (row-locked, skip-locked) -> send via the channel's provider ->
//   record the outcome (retries with backoff, SMS usage, audit) in the DB.
// The database decided WHO gets WHAT on WHICH channel; this only transports.
// =============================================================================

type Claimed = {
  id: string
  school_id: string
  channel: "in_app" | "email" | "sms" | "push"
  destination: string
  attempts: number
  title: string
  message: string
  priority: string
  data: Record<string, unknown>
  notification_id: string
}

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"

async function send(d: Claimed, providers: ReturnType<typeof getProviders>): Promise<{ provider: string; result: SendResult }> {
  const link = `${siteUrl()}/notifications/${d.notification_id}/open`
  switch (d.channel) {
    case "email":
      return {
        provider: providers.email.name,
        result: await providers.email.send({ to: d.destination, subject: d.title, text: `${d.message}\n\nOpen in the app: ${link}` }),
      }
    case "sms":
      return {
        provider: providers.sms.name,
        // Keep SMS short (cost is per segment); no links to avoid spam filtering.
        result: await providers.sms.send({ to: d.destination, body: `${d.title}: ${d.message}`.slice(0, 300) }),
      }
    case "push":
      return {
        provider: providers.push.name,
        result: await providers.push.send({
          token: d.destination,
          title: d.title,
          body: d.message.slice(0, 200),
          data: { notification_id: d.notification_id, entity_type: String(d.data.entity_type ?? ""), entity_id: String(d.data.entity_id ?? "") },
        }),
      }
    default:
      return { provider: "in_app", result: { ok: true, providerMessageId: "in-app" } }
  }
}

/** Process up to `limit` pending deliveries. Safe to run concurrently (rows are claimed with SKIP LOCKED). */
export async function processDeliveryQueue(limit = 50) {
  const db = createAdminClient()
  const providers = getProviders()
  const { data, error } = await db.rpc("claim_notification_deliveries", { p_limit: limit })
  if (error) throw new Error(`claim failed: ${error.message}`)
  const claimed = (data ?? []) as Claimed[]
  const outcome = { processed: claimed.length, sent: 0, failed: 0 }

  for (const d of claimed) {
    let provider = d.channel as string
    let result: SendResult
    try {
      ;({ provider, result } = await send(d, providers))
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : "Unknown provider error" }
    }
    const { error: completeError } = await db.rpc("complete_notification_delivery", {
      p_id: d.id,
      p_success: result.ok,
      p_provider: provider,
      p_provider_message_id: result.ok ? result.providerMessageId : undefined,
      p_error: result.ok ? undefined : result.error,
    })
    if (completeError) console.error("[deliveries] could not record outcome", d.id, completeError.message)
    if (result.ok) outcome.sent++
    else outcome.failed++
  }
  return outcome
}

/** Scheduled communication work: due announcements, reminders, then the delivery queue. */
export async function runCommunicationJobs(limit = 100) {
  const db = createAdminClient()
  const { data: jobs, error } = await db.rpc("run_communication_jobs")
  if (error) throw new Error(`jobs failed: ${error.message}`)
  const deliveries = await processDeliveryQueue(limit)
  return { jobs, deliveries }
}
