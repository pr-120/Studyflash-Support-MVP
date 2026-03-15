import { NextRequest, NextResponse } from "next/server";
import { enrichUser } from "@/lib/enrichment";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/enrichment?email=user@example.com
 *
 * Fetches enrichment data for a user from configured external services.
 * Returns whatever is available — null sections mean the service is not configured.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const email = req.nextUrl.searchParams.get("email");

  if (!email) {
    return NextResponse.json(
      { error: "email query parameter is required" },
      { status: 400 }
    );
  }

  const result = await enrichUser(email);

  return NextResponse.json(result);
}
