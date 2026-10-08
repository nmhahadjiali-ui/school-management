import "server-only"
import { createHash } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { getPaymentProvider } from "@/server/payments/providers"

export type WebhookResponse = { status: number; body: Record<string, unknown> }

const MAX_BODY = 64 * 1024

/**
 * Handle one provider webhook. Order matters:
 *  1. authenticate the RAW body (signature + timestamp); unsigned events are
 *     recorded as rejected and change nothing;
 *  2. record the event — (provider, event_id) is unique, so a retried or
 *     replayed event is answered "duplicate" without touching money;
 *  3. confirm the outcome with the provider (server-side verification);
 *  4. complete the transaction in ONE database transaction — idempotent, and
 *     the verified amount must equal what the database asked for.
 * Uses the service key (provider calls carry no user session); every step is
 * authorized by the provider signature and validated by the database.
 */
export async function handlePaymentWebhook(providerName: string, rawBody: string, headers: Headers): Promise<WebhookResponse> {
  const provider = getPaymentProvider(providerName)
  if (!provider) return { status: 404, body: { error: "unknown_provider" } }
  if (rawBody.length > MAX_BODY) return { status: 413, body: { error: "too_large" } }

  const admin = createAdminClient()
  const check = provider.verifyWebhook(rawBody, headers)

  if (!check.valid) {
    // Recorded under a hash so a forged event can never "claim" a real event id.
    const digest = createHash("sha256").update(rawBody).digest("hex")
    await admin.rpc("record_webhook_event", {
      p_provider: provider.name,
      p_event_id: `rejected:${digest}`,
      p_event_type: "unverified",
      p_payload: { reason: check.reason, bytes: rawBody.length },
      p_signature_valid: false,
    })
    console.warn(`[payments:${provider.name}] rejected webhook: ${check.reason}`)
    return { status: 401, body: { error: "invalid_signature" } }
  }

  const { event } = check
  const txId = /^[0-9a-f-]{36}$/i.test(event.transactionId) ? event.transactionId : null
  const { data: rec, error: recError } = await admin.rpc("record_webhook_event", {
    p_provider: provider.name,
    p_event_id: event.eventId,
    p_event_type: event.type,
    p_payload: check.payload as never,
    p_signature_valid: true,
    p_transaction_id: txId ?? undefined,
  })
  if (recError || !rec) {
    console.error(`[payments:${provider.name}] could not record event`, recError?.code, recError?.message)
    return { status: 500, body: { error: "retry" } }
  }
  const recorded = rec as { event_row_id: string; status: string; duplicate: boolean }
  if (recorded.duplicate) return { status: 200, body: { ok: true, duplicate: true } }

  const finish = (status: "processed" | "ignored" | "failed", error?: string) =>
    admin.rpc("finish_webhook_event", { p_event_row_id: recorded.event_row_id, p_status: status, p_error: error })

  if (!txId) {
    await finish("ignored", "No matching transaction reference")
    return { status: 200, body: { ok: true, ignored: true } }
  }

  try {
    const verified = await provider.verifyPayment(event)
    const { data, error } = await admin.rpc("complete_payment_transaction", {
      p_transaction_id: txId,
      p_status: verified.outcome,
      p_verified_amount: verified.amount as unknown as number, // decimal string; PostgreSQL parses it as numeric
      p_failure_reason: verified.failureReason,
    })
    if (error) throw new Error(`${error.code} ${error.message}`)
    await finish("processed")
    return { status: 200, body: { ok: true, result: data } }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error(`[payments:${provider.name}] processing failed`, message)
    await finish("failed", message)
    // Non-2xx so the provider retries; the retry is processed again (status "failed" is not final).
    return { status: 500, body: { error: "retry" } }
  }
}
