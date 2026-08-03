"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const DESTINATIONS = [
  { href: "/content/quick", label: "Create content", paths: ["/content/quick", "/content/ideas"] },
  { href: "/content/projects", label: "In progress", paths: ["/content/projects"] },
  { href: "/content/library", label: "Content library", paths: ["/content/library"] },
] as const;

/** The everyday editorial journey. Idea discovery is a way to start creating,
 * not a separate product; voice belongs under Company rather than this nav. */
export function ContentSectionNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (pathname === "/content/style" || pathname.startsWith("/content/style/") || searchParams.has("setup")) return null;

  return (
    <nav aria-label="Content workspace" className="mb-6 flex flex-wrap gap-1 rounded-xl border border-zinc-800 bg-zinc-900/60 p-1.5">
      {DESTINATIONS.map((destination) => {
        const active = destination.paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
        return (
          <Link
            key={destination.href}
            href={destination.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-orange-500/15 text-orange-300"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-white",
            )}
          >
            {destination.label}
          </Link>
        );
      })}
    </nav>
  );
}
