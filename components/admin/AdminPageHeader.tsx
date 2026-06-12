import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The gradient-icon page header repeated across every admin page. One place to
 * change the shape; pages just pass an icon, a gradient, a title, and a
 * subtitle. `action` renders on the right (export buttons, etc.).
 */
export function AdminPageHeader({
  icon: Icon, gradient, title, subtitle, action,
}: {
  icon: LucideIcon;
  /** Tailwind from-/to- classes, e.g. "from-amber-500 to-orange-600". */
  gradient: string;
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 mb-8">
      <div className={cn("w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-lg", gradient)}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <h1 className="text-3xl font-bold text-white tracking-tight">{title}</h1>
        {subtitle && <p className="text-zinc-400 text-sm mt-1">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
