import "server-only"
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto"

// =============================================================================
// Online payment provider abstraction. The database knows transactions,
// payments and receipts; WHICH company processes a card / e-wallet payment is
// decided here, server-side, from environment variables. Adding a provider
// (e.g. a local gateway) = implement this interface + register it below.
// Secrets (API keys, webhook signing secrets) live in server env vars only —
// never in the browser, the database or the Flutter app.
//
// Golden rule: a payment becomes "successful" ONLY after server-side
// verification (signed webhook + provider confirmation), never because a
// browser was redirected to a success page.
// =============================================================================

export type TransactionOutcome = "successful" | "failed" | "cancelled" | "expired"

export type CreatePaymentInput = {
  /** Our payment_transactions.id; sent to the provider as the reference. */
  transactionId: string
  /** Decimal string computed by the database, e.g. "1500.00". */
  amount: string
  currency: string
  description: string
  returnUrl: string
}

export type CreatePaymentResult = { ok: true; providerTransactionId: string; checkoutUrl: string } | { ok: false; error: string }

/** A provider event whose signature has been verified. */
export type VerifiedEvent = {
  eventId: string
  type: string
  transactionId: string
  providerTransactionId: string
  outcome: TransactionOutcome
  /** Decimal string as reported by the provider. */
  amount: string
  currency: string
  failureReason?: string
}

export type WebhookCheck = { valid: true; event: VerifiedEvent; payload: unknown } | { valid: false; reason: string }

export interface PaymentProvider {
  readonly name: string
  readonly label: string
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>
  /** Authenticate a webhook request (signature over the RAW body). */
  verifyWebhook(rawBody: string, headers: Headers): WebhookCheck
  /**
   * Confirm the final status with the provider before money is recorded.
   * Real providers call their API here (never trust the event body alone).
   */
  verifyPayment(event: VerifiedEvent): Promise<{ outcome: TransactionOutcome; amount: string; failureReason?: string }>
  getPaymentStatus(providerTransactionId: string): Promise<TransactionOutcome | "pending" | null>
  refundPayment(providerTransactionId: string, amount: string): Promise<{ ok: true; refundId: string } | { ok: false; error: string }>
}

// --- Signing helpers -------------------------------------------------------------------
export const SIGNATURE_HEADER = "x-payment-signature"
export const TIMESTAMP_HEADER = "x-payment-timestamp"
const MAX_SKEW_SECONDS = 300

export function sign(secret: string, timestamp: string, rawBody: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")
}

function safeEqualHex(a: string, b: string) {
  const ab = Buffer.from(a, "hex")
  const bb = Buffer.from(b, "hex")
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb)
}

const MONEY = /^\d{1,10}(\.\d{1,2})?$/
const OUTCOMES = new Set<TransactionOutcome>(["successful", "failed", "cancelled", "expired"])

/**
 * Development / test provider. Plays the role of an external gateway: its
 * checkout page (/pay/simulator/[id]) lets you choose an outcome, and the
 * outcome is delivered as an HMAC-signed webhook to /api/payments/webhooks/simulator
 * — exactly the path a real provider uses. NEVER enable it in production.
 */
class SimulatorProvider implements PaymentProvider {
  readonly name = "simulator"
  readonly label = "Payment simulator (test mode)"
  constructor(private readonly secret: string) {}

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const providerTransactionId = `sim_${randomUUID()}`
    // A real provider returns its own hosted (https) checkout page.
    const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "")
    return { ok: true, providerTransactionId, checkoutUrl: `${site}/pay/simulator/${input.transactionId}` }
  }

  /** Builds the signed request the "provider" sends (used by the simulator checkout). */
  signedEvent(event: Omit<VerifiedEvent, "eventId">) {
    const body = JSON.stringify({ id: `evt_${randomUUID()}`, ...event })
    const timestamp = String(Math.floor(Date.now() / 1000))
    return { body, headers: { "content-type": "application/json", [TIMESTAMP_HEADER]: timestamp, [SIGNATURE_HEADER]: sign(this.secret, timestamp, body) } }
  }

  verifyWebhook(rawBody: string, headers: Headers): WebhookCheck {
    const timestamp = headers.get(TIMESTAMP_HEADER) ?? ""
    const signature = headers.get(SIGNATURE_HEADER) ?? ""
    if (!/^\d{10}$/.test(timestamp) || !/^[0-9a-f]{64}$/.test(signature)) return { valid: false, reason: "Missing signature" }
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > MAX_SKEW_SECONDS) return { valid: false, reason: "Stale timestamp" }
    if (!safeEqualHex(signature, sign(this.secret, timestamp, rawBody))) return { valid: false, reason: "Invalid signature" }
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return { valid: false, reason: "Malformed body" }
    }
    const { id, type, transactionId, providerTransactionId, outcome, amount, currency, failureReason } = payload as Record<string, string>
    if (typeof id !== "string" || typeof transactionId !== "string" || !OUTCOMES.has(outcome as TransactionOutcome) || !MONEY.test(String(amount))) {
      return { valid: false, reason: "Malformed event" }
    }
    return {
      valid: true,
      payload,
      event: { eventId: id, type: String(type ?? "payment.updated"), transactionId, providerTransactionId: String(providerTransactionId ?? ""), outcome: outcome as TransactionOutcome, amount: String(amount), currency: String(currency ?? ""), failureReason },
    }
  }

  // The simulator has no remote API; its signed event IS the confirmation.
  async verifyPayment(event: VerifiedEvent) {
    return { outcome: event.outcome, amount: event.amount, failureReason: event.failureReason }
  }

  async getPaymentStatus() {
    return null
  }

  async refundPayment() {
    return { ok: true as const, refundId: `sim_refund_${randomUUID()}` }
  }
}

/** Providers enabled on this server (PAYMENT_PROVIDERS, comma-separated). */
export function getPaymentProvider(name: string): PaymentProvider | null {
  const enabled = (process.env.PAYMENT_PROVIDERS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  if (!enabled.includes(name)) return null
  if (name === "simulator") {
    const secret = process.env.PAYMENT_SIMULATOR_SECRET
    return secret && secret.length >= 16 ? new SimulatorProvider(secret) : null
  }
  return null
}

/** The provider used for new online payments (first enabled one). */
export function defaultPaymentProvider(): PaymentProvider | null {
  const first = (process.env.PAYMENT_PROVIDERS ?? "").split(",").map((s) => s.trim()).find(Boolean)
  return first ? getPaymentProvider(first) : null
}

export function simulator(): SimulatorProvider | null {
  const p = getPaymentProvider("simulator")
  return p instanceof SimulatorProvider ? p : null
}
