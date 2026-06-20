"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

type Theme = "dark" | "light";

/**
 * Light / dark theme switch. Writes the choice to a year-long cookie and flips
 * <html data-theme> live (no reload); the server reads the same cookie on the
 * next render so there's no flash. Available to every role.
 */
export function AppearanceSettings() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  function apply(next: Theme) {
    document.documentElement.dataset.theme = next;
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
    setTheme(next);
  }

  return (
    <section className="surface-card p-5">
      <div className="flex items-center gap-2 mb-1">
        <Monitor className="w-4 h-4 text-zinc-400" />
        <h2 className="text-lg font-semibold text-white">Appearance</h2>
      </div>
      <p className="text-sm text-zinc-400 mb-4">Choose how the portal looks. Dark is the default.</p>
      <div className="grid grid-cols-2 gap-3 max-w-sm">
        <Option icon={Moon} label="Dark" active={theme === "dark"} onClick={() => apply("dark")} />
        <Option icon={Sun} label="Light" active={theme === "light"} onClick={() => apply("light")} />
      </div>
    </section>
  );
}

function Option({ icon: Icon, label, active, onClick }: {
  icon: typeof Moon; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors",
        active
          ? "border-orange-500/60 bg-orange-500/10 text-white"
          : "border-zinc-700 bg-zinc-900/40 text-zinc-300 hover:border-zinc-600",
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {label}
      {active && <span className="ml-auto text-xs text-orange-300">Active</span>}
    </button>
  );
}
