import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { NextResponse } from "next/server";

/**
 * Get the current session or return a 401 response.
 * Use in API routes:
 *
 * const session = await requireAuth();
 * if (session instanceof NextResponse) return session;
 * // session is now the authenticated session
 */
export async function requireAuth() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
}
