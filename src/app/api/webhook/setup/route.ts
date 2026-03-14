import { NextRequest, NextResponse } from "next/server";
import { createWebhookSubscription } from "@/lib/graph";

/**
 * POST /api/webhook/setup
 *
 * Registers a Microsoft Graph webhook subscription for new mail
 * in the shared support mailbox. Call this once during setup.
 *
 * Body: { "notificationUrl": "https://your-domain.com/api/webhook/graph" }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const notificationUrl =
      body.notificationUrl ??
      `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/webhook/graph`;

    const subscription = await createWebhookSubscription(notificationUrl);

    return NextResponse.json({
      message: "Webhook subscription created",
      subscription,
    });
  } catch (err) {
    console.error("Webhook setup failed:", err);
    return NextResponse.json(
      {
        error: "Failed to create webhook subscription. Check Azure credentials.",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
