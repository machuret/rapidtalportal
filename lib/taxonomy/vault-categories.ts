/**
 * Single source of truth for the Vault content taxonomy.
 *
 * Previously the 6 categories (labels, colours, icons, ordering, validation)
 * were redefined in VaultClient, VaultItemRow, the Company Report, and the API
 * route — change one and the rest drift. Everything app-side now imports here.
 *
 * Note: the Supabase edge functions (vault-process / kb-generate) keep their own
 * copy on purpose — they run in Deno and are deployed as self-contained files.
 */
import {
  Package, Contact, Workflow, ShieldCheck, BookOpen, FileText, type LucideIcon,
} from "lucide-react";
import type { VaultCategory } from "@/types/database";

export type { VaultCategory };

export interface VaultCategoryMeta {
  /** Short label for badges/filters, e.g. "Process". */
  shortLabel: string;
  /** Descriptive label for reports/sections, e.g. "Processes & Flows". */
  fullLabel: string;
  /** One-line description used in the Company Report. */
  blurb: string;
  /** Tailwind classes for a coloured badge / active filter chip. */
  badgeClass: string;
  icon: LucideIcon;
}

export const VAULT_CATEGORIES: Record<VaultCategory, VaultCategoryMeta> = {
  service: {
    shortLabel: "Service", fullLabel: "Services & Products", blurb: "What the company offers",
    badgeClass: "bg-green-500/15 text-green-400 border-green-500/25", icon: Package,
  },
  contact: {
    shortLabel: "Contact", fullLabel: "Contacts", blurb: "People, suppliers, clients",
    badgeClass: "bg-purple-500/15 text-purple-400 border-purple-500/25", icon: Contact,
  },
  process: {
    shortLabel: "Process", fullLabel: "Processes & Flows", blurb: "How things get done",
    badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/25", icon: Workflow,
  },
  policy: {
    shortLabel: "Policy", fullLabel: "Policies", blurb: "Rules, guidelines, compliance",
    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/25", icon: ShieldCheck,
  },
  reference: {
    shortLabel: "Reference", fullLabel: "Reference", blurb: "Background knowledge & FAQs",
    badgeClass: "bg-cyan-500/15 text-cyan-400 border-cyan-500/25", icon: BookOpen,
  },
  general: {
    shortLabel: "General", fullLabel: "General", blurb: "Everything else",
    badgeClass: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25", icon: FileText,
  },
};

/**
 * All category keys as a tuple (use for zod enums, validation, iteration).
 * Standalone literal (not derived from the object) so server routes can import
 * it without pulling lucide-react icons into their bundle.
 */
export const VAULT_CATEGORY_KEYS = [
  "service", "contact", "process", "policy", "reference", "general",
] as const satisfies readonly VaultCategory[];

/** Display order for report sections (services & contacts first). */
export const VAULT_CATEGORY_ORDER: VaultCategory[] = [
  "service", "contact", "process", "policy", "reference", "general",
];

export function isVaultCategory(v: unknown): v is VaultCategory {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(VAULT_CATEGORIES, v);
}
