"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { completeLogin } from "@/lib/auth";

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-slate-700">Completing sign-in…</p>}>
      <Callback />
    </Suspense>
  );
}

function Callback() {
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = params.get("code");
    const denied = params.get("error_description") || params.get("error");
    if (denied) {
      setError(denied);
      return;
    }
    if (!code) {
      setError("No authorization code was returned.");
      return;
    }
    completeLogin(code)
      .then((back) => router.replace(back))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Sign-in failed."));
  }, [params, router]);

  return (
    <div className="max-w-md mx-auto px-4 py-20 text-center space-y-3">
      {error ? (
        <>
          <h1 className="text-xl font-bold text-slate-900">Sign-in did not complete</h1>
          <p role="alert" className="text-sm text-rose-800">{error}</p>
          <Link href="/dashboard" className="text-sm font-semibold text-emerald-800 underline">Back to the app</Link>
        </>
      ) : (
        <p role="status" className="text-sm text-slate-700">Completing sign-in…</p>
      )}
    </div>
  );
}
