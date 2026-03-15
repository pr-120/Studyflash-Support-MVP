"use client";

import { signIn } from "next-auth/react";
import { Headphones } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f0f0f]">
      <div className="w-full max-w-sm rounded-xl bg-white/5 p-8 shadow-2xl border border-white/10">
        {/* Logo / Title */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600">
            <Headphones className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-xl font-semibold text-white">
            Studyflash Support
          </h1>
          <p className="mt-1 text-sm text-white/50">
            Sign in to access the support platform
          </p>
        </div>

        {/* Sign in button */}
        <button
          onClick={() => signIn("azure-ad", { callbackUrl: "/" })}
          className="flex w-full items-center justify-center gap-3 rounded-lg bg-white px-4 py-3 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-100"
        >
          <svg className="h-5 w-5" viewBox="0 0 21 21">
            <rect x="1" y="1" width="9" height="9" fill="#f25022" />
            <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
            <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
            <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
          </svg>
          Sign in with Microsoft
        </button>

        <p className="mt-6 text-center text-[11px] text-white/30">
          Access restricted to authorized team members
        </p>
      </div>
    </div>
  );
}
