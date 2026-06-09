import { cn } from "@/lib/utils";
import { ROLES, type UserRole } from "@/lib/taxonomy/roles";

/** Coloured role pill. Single styling source via lib/taxonomy/roles. */
export function RoleBadge({ role, className }: { role: UserRole; className?: string }) {
  const meta = ROLES[role] ?? ROLES.va;
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", meta.badgeClass, className)}>
      {meta.label}
    </span>
  );
}
