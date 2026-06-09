import { cn } from "@/lib/utils";
import { VAULT_CATEGORIES, type VaultCategory } from "@/lib/taxonomy/vault-categories";

/** Coloured vault-category pill. Single styling source via lib/taxonomy. */
export function CategoryBadge({
  category,
  full = false,
  className,
}: {
  category: VaultCategory;
  full?: boolean;
  className?: string;
}) {
  const meta = VAULT_CATEGORIES[category];
  if (!meta) return null;
  return (
    <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded border", meta.badgeClass, className)}>
      {full ? meta.fullLabel : meta.shortLabel}
    </span>
  );
}
