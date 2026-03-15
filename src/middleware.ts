import { withAuth } from "next-auth/middleware";

/**
 * Protects all pages and API routes with NextAuth session check.
 * Unauthenticated users are redirected to /login.
 *
 * Public routes (excluded via matcher):
 * - /login — the login page itself
 * - /api/auth/* — NextAuth's sign-in/callback/signout routes
 * - /api/webhook/* — Microsoft Graph webhook (must be reachable without auth)
 */
export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - /login
     * - /api/auth (NextAuth routes)
     * - /api/webhook (Graph webhook — must be public)
     * - /_next (Next.js internals)
     * - /favicon.ico, /public assets
     */
    "/((?!login|api/auth|api/webhook|_next|favicon.ico).*)",
  ],
};
