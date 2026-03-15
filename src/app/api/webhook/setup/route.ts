import { NextRequest, NextResponse } from "next/server";
import { createWebhookSubscription } from "@/lib/graph";
import { requireAuth } from "@/lib/auth";

/**
 * POST /api/webhook/setup
 *
 * Registers a Microsoft Graph webhook subscription for new mail
 * in the shared support mailbox. Call this once during setup.
 *
 * Auth: requires either a valid session OR the GRAPH_WEBHOOK_SECRET
 * as a Bearer token (for CLI/curl setup before first login).
 *
 * Body: { "notificationUrl": "https://your-domain.com/api/webhook/graph" }
 */
export async function POST(req: NextRequest) {
  // Allow auth via session OR webhook secret (for CLI setup)
  const bearerToken = req.headers.get("authorization")?.replace("Bearer ", "");
  const webhookSecret = process.env.GRAPH_WEBHOOK_SECRET;

  if (bearerToken && webhookSecret && bearerToken === webhookSecret) {
    // Authenticated via webhook secret — OK
  } else {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
  }

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
