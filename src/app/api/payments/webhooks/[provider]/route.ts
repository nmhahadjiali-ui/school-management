import { NextResponse } from "next/server"
import { handlePaymentWebhook } from "@/server/payments/webhooks"

/**
 * POST /api/payments/webhooks/:provider — payment provider callbacks.
 * Public (providers have no session); authenticated by the provider's
 * signature over the raw body. See src/server/payments/webhooks.ts.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/payments/webhooks/[provider]">) {
  const { provider } = await params
  const raw = await request.text()
  const { status, body } = await handlePaymentWebhook(provider, raw, request.headers)
  return NextResponse.json(body, { status })
}
