"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [ready, setReady] = useState<"checking" | "ok" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // The /auth/callback route exchanged the recovery code for a session before
  // redirecting here. If that session isn't present, the link was bad/expired.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setReady(data.user ? "ok" : "invalid");
    });
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 px-8 py-8 shadow-xl">
        <div className="mb-7 text-center">
          <p className="text-2xl font-bold text-white tracking-tight">Set a new password</p>
        </div>
        {ready === "checking" && <p className="text-sm text-zinc-400 text-center">Verifying your link…</p>}
        {ready === "invalid" && (
          <div className="flex flex-col gap-4 text-center">
            <p className="text-sm text-zinc-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-3">
              This reset link is invalid or has expired. Request a new one.
            </p>
            <Link href="/forgot-password" className="text-sm text-zinc-400 hover:text-zinc-200">
              Request a new link
            </Link>
          </div>
        )}
        {ready === "ok" && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password" className="text-zinc-300 text-sm font-medium">
                New password
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 h-10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm" className="text-zinc-300 text-sm font-medium">
                Confirm password
              </Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 h-10"
              />
            </div>
            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            <Button type="submit" disabled={loading} className="w-full h-10 text-sm font-semibold mt-1">
              {loading ? "Saving…" : "Update password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
