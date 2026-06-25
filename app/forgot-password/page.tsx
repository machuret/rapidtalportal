"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Always show the same confirmation regardless of whether the email exists,
    // so this endpoint can't be used to enumerate accounts.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setSent(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 px-8 py-8 shadow-xl">
        <div className="mb-7 text-center">
          <p className="text-2xl font-bold text-white tracking-tight">Reset password</p>
          <p className="text-sm text-zinc-400 mt-1">We&apos;ll email you a reset link</p>
        </div>
        {sent ? (
          <div className="flex flex-col gap-4 text-center">
            <p className="text-sm text-zinc-300 bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-3">
              If an account exists for <span className="font-medium text-white">{email}</span>, a
              reset link is on its way. Check your inbox.
            </p>
            <Link href="/login" className="text-sm text-zinc-400 hover:text-zinc-200">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className="text-zinc-300 text-sm font-medium">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 h-10"
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full h-10 text-sm font-semibold mt-1">
              {loading ? "Sending…" : "Send reset link"}
            </Button>
            <Link href="/login" className="text-sm text-zinc-400 hover:text-zinc-200 text-center">
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
