import Link from "next/link";
import { cn } from "@/lib/utils";
import { Archive, BookOpen } from "lucide-react";

/**
 * Sub-navigation for the consolidated Vault section: the document brain and
 * the curated Q&A knowledge layer live under one roof (both feed Ask the
 * Vault at answer time).
 */
export function VaultTabs({ active }: { active: "documents" | "knowledge" }) {
  const tabs = [
    { id: "documents" as const, href: "/vault", label: "Documents", icon: Archive },
    { id: "knowledge" as const, href: "/vault/knowledge", label: "Q&A Knowledge", icon: BookOpen },
  ];
  return (
    <div className="flex items-center gap-1 border-b border-zinc-800 mb-6">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          className={cn(
            "inline-flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors",
            active === t.id
              ? "border-orange-500 text-white font-medium"
              : "border-transparent text-zinc-400 hover:text-zinc-200",
          )}
        >
          <t.icon className="w-4 h-4" /> {t.label}
        </Link>
      ))}
    </div>
  );
}
