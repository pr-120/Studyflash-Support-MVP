import type { NextAuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_CLIENT_ID!,
      clientSecret: process.env.AZURE_CLIENT_SECRET!,
      tenantId: process.env.AZURE_TENANT_ID!,
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.azureId = (profile as Record<string, unknown>).oid as string;
        token.email = profile.email ?? token.email;
        token.name = profile.name ?? token.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email as string;
        session.user.name = token.name as string;
      }
      return session;
    },
    async signIn({ user, profile }) {
      // Auto-create a TeamMember record when a user signs in via Azure AD,
      // so they appear in the assignee dropdown immediately.
      if (user.email) {
        try {
          await prisma.teamMember.upsert({
            where: { email: user.email },
            update: { name: user.name ?? user.email },
            create: {
              email: user.email,
              name: user.name ?? user.email,
              role: "support",
            },
          });
        } catch (err) {
          // Non-fatal — don't block sign-in if DB upsert fails
          console.error("Failed to upsert TeamMember on sign-in:", err);
        }
      }
      return true;
    },
  },
};
