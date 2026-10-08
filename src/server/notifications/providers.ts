import "server-only"
import { randomUUID } from "node:crypto"

// =============================================================================
// Delivery provider abstraction. The notification system (database) only
// knows channels and delivery rows; WHICH company sends an email, SMS or push
// is decided here, server-side, from environment variables. Adding a vendor =
// implement one interface + register it below. Credentials stay in server env
// vars and never reach the browser or the database.
// =============================================================================

export type SendResult = { ok: true; providerMessageId: string } | { ok: false; error: string; retryable?: boolean }

export type EmailMessage = { to: string; subject: string; text: string; html?: string }
export type SmsMessage = { to: string; body: string }
export type PushMessage = { token: string; title: string; body: string; data: Record<string, string> }

export interface EmailProvider {
  readonly name: string
  send(message: EmailMessage): Promise<SendResult>
}
export interface SmsProvider {
  readonly name: string
  send(message: SmsMessage): Promise<SendResult>
}
export interface PushProvider {
  readonly name: string
  send(message: PushMessage): Promise<SendResult>
}

/** Mask a destination for logs (never log full phone numbers, emails or tokens). */
export function maskDestination(value: string) {
  if (value.includes("@")) {
    const [user, domain] = value.split("@")
    return `${user.slice(0, 2)}***@${domain}`
  }
  return value.length <= 4 ? "***" : `***${value.slice(-4)}`
}

/**
 * Development / test provider for every channel: records the send without
 * contacting anyone. Destinations containing "FAIL" fail, to exercise retries.
 */
class SimulatorProvider implements EmailProvider, SmsProvider, PushProvider {
  constructor(readonly name: string) {}
  async send(message: EmailMessage | SmsMessage | PushMessage): Promise<SendResult> {
    const destination = "to" in message ? message.to : message.token
    if (destination.toUpperCase().includes("FAIL")) return { ok: false, error: "Simulated delivery failure", retryable: true }
    if (process.env.NODE_ENV !== "test") console.info(`[${this.name}] simulated send to ${maskDestination(destination)}`)
    return { ok: true, providerMessageId: `sim-${randomUUID()}` }
  }
}

/** Used when a channel has no provider configured: deliveries fail clearly (and visibly to admins). */
class UnconfiguredProvider implements EmailProvider, SmsProvider, PushProvider {
  constructor(readonly name: string) {}
  async send(): Promise<SendResult> {
    return { ok: false, error: `No ${this.name} provider is configured on the server`, retryable: false }
  }
}

// Register real vendors here, e.g.:
//   case "resend":  return new ResendEmailProvider(process.env.RESEND_API_KEY!)
//   case "semaphore": return new SemaphoreSmsProvider(process.env.SEMAPHORE_API_KEY!)
//   case "fcm":     return new FcmPushProvider(process.env.FCM_SERVICE_ACCOUNT!)
function pick<T>(kind: "email" | "sms" | "push", configured: string | undefined): T {
  switch ((configured ?? "").toLowerCase()) {
    case "simulator":
      return new SimulatorProvider(`${kind}-simulator`) as T
    default:
      return new UnconfiguredProvider(kind) as T
  }
}

export function getProviders() {
  return {
    email: pick<EmailProvider>("email", process.env.EMAIL_PROVIDER),
    sms: pick<SmsProvider>("sms", process.env.SMS_PROVIDER),
    push: pick<PushProvider>("push", process.env.PUSH_PROVIDER),
  }
}
