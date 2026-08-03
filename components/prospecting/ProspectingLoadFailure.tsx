"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ProspectingLoadFailure({
  title,
  message,
  retryLabel = "Try again",
  onRetry,
  compact = false,
}: {
  title: string;
  message?: string | null;
  retryLabel?: string;
  onRetry: () => void;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100" role="alert">
        <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" />{title}</span>
        <Button size="sm" variant="outline" onClick={onRetry}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{retryLabel}</Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-8 text-center" role="alert">
      <p className="font-medium text-red-100">{title}</p>
      {message && <p className="mt-1 text-sm text-red-200/80">{message}</p>}
      <Button className="mt-4" variant="outline" onClick={onRetry}><RefreshCw className="mr-1.5 h-4 w-4" />{retryLabel}</Button>
    </div>
  );
}
