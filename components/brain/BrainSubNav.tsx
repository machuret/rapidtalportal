"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { href: "/brain", label: "Overview" },
  { href: "/brain/analytics", label: "Analytics" },
  { href: "/brain/learning", label: "Learning" },
] as const;

/** In-page sub-nav for the /brain/* section group (same pill pattern the
 *  super-admin client pickers use). */
export function BrainSubNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Company Brain sections" className="mb-8 flex flex-wrap gap-2">
      {SECTIONS.map((section) => {
        const active =
          section.href === "/brain" ? pathname === "/brain" : pathname.startsWith(section.href);
        return (
          <Link
            key={section.href}
            href={section.href}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "border-orange-500/50 bg-orange-500/15 text-orange-300"
                : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white",
            )}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
