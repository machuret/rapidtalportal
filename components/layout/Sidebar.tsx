"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { DbUser, DbClient } from "@/types/database";
import {
  LayoutDashboard,
  Building2,
  Users,
  Archive,
  Dna,
  LogOut,
  ShieldCheck,
  ContactRound,
  ListChecks,
  PenLine,
  NotebookPen,
  UserCircle,
  UsersRound,
  MessageSquare,
  Brain,
  Sparkles,
  Wand2,
  BarChart3,
  Eye,
  KanbanSquare,
  KeyRound,
  Notebook,
  Handshake,
  Bug,
  Wrench,
  SlidersHorizontal,
  Briefcase,
  AlertTriangle,
  Activity,
  FileBarChart,
  TrendingUp,
  Wallet,
  BookOpen,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "./NotificationsBell";

type NavItem = { href: string; label: string; icon: LucideIcon } | { section: string };

interface SidebarProps {
  user: DbUser;
  client: DbClient | null;
  onNavigate?: () => void;
}

const vaLinks: NavItem[] = [
  { href: "/dashboard",      label: "Dashboard",      icon: LayoutDashboard },
  { href: "/company-report", label: "Company Report", icon: Brain },
  { href: "/ask",            label: "Ask the Vault",  icon: Sparkles },
  { href: "/compose",        label: "Compose",        icon: Wand2 },
  { href: "/tasks",          label: "Tasks",          icon: KanbanSquare },
  { href: "/notebook",       label: "Notebook",       icon: Notebook },
  { href: "/tools",          label: "Tools",          icon: Wrench },
  { href: "/my-job",         label: "My Job",         icon: Briefcase },
  { href: "/access",         label: "Access",         icon: KeyRound },
  { href: "/daily-log",      label: "Daily Log",      icon: NotebookPen },
  { href: "/messages",       label: "Messages",       icon: MessageSquare },
  { href: "/crm",            label: "CRM",            icon: ContactRound },
  { href: "/content",        label: "Content",        icon: PenLine },
  { href: "/sops",           label: "SOPs",           icon: ListChecks },
  { href: "/company-dna",    label: "Company DNA",    icon: Dna },
  { href: "/vault",          label: "Vault",          icon: Archive },
  { href: "/guide",          label: "Guide",          icon: BookOpen },
  { href: "/profile",        label: "My Profile",     icon: UserCircle },
];

// Client-first: the things a client does — see progress, oversee the team,
// communicate — lead. The VA/AI work tools (which a client *can* open but their
// VA mostly drives) are grouped under "Workspace" so the top level reads like a
// client product, not the VA's.
// Grouped by job-to-be-done so a non-technical client isn't faced with a flat
// wall of 17 links. The three AI-insight surfaces (Company Brain / Company
// Report / Brain Analytics) are deliberately co-located so it's clear they're
// related views of the same thing.
const clientAdminLinks: NavItem[] = [
  { href: "/dashboard",      label: "Dashboard",       icon: LayoutDashboard },
  { section: "Team & work" },
  { href: "/tasks",          label: "Tasks",           icon: KanbanSquare },
  { href: "/messages",       label: "Messages",        icon: MessageSquare },
  { href: "/notebook",       label: "Notebook",        icon: Notebook },
  { href: "/supervision",    label: "Supervision",     icon: Eye },
  { href: "/team",           label: "My Team",         icon: UsersRound },
  { href: "/reports",        label: "Reports",         icon: FileBarChart },
  { section: "Your AI & knowledge" },
  { href: "/company-dna",    label: "Company DNA",     icon: Dna },
  { href: "/vault",          label: "Vault",           icon: Archive },
  { href: "/ask",            label: "Ask the Vault",   icon: Sparkles },
  { href: "/brain",          label: "Company Brain",   icon: Brain },
  { href: "/brain-analytics",label: "Brain Analytics", icon: BarChart3 },
  { section: "Tools" },
  { href: "/crm",            label: "CRM",             icon: ContactRound },
  { href: "/access",         label: "Access",          icon: KeyRound },
  { section: "Account" },
  { href: "/guide",          label: "Guide",           icon: BookOpen },
  { href: "/profile",        label: "My Profile",      icon: UserCircle },
];

const adminLinks: NavItem[] = [
  { href: "/admin",            label: "Overview",    icon: LayoutDashboard },
  { href: "/admin/clients",    label: "Clients",     icon: Building2 },
  { href: "/admin/users",      label: "All Users",   icon: Users },
  { href: "/admin/leads",      label: "Leads",       icon: TrendingUp },
  { href: "/admin/expenses",   label: "Expenses",    icon: Wallet },
  { href: "/admin/placements", label: "Placements",  icon: Handshake },
  { href: "/admin/sops",       label: "SOP Library", icon: ListChecks },
  { href: "/admin/vault",      label: "Client Vaults", icon: Archive },
  { href: "/admin/ask",        label: "Ask as Client", icon: Sparkles },
  { href: "/access",           label: "Access",      icon: KeyRound },
  { href: "/supervision",      label: "Supervision", icon: Eye },
  { href: "/admin/daily-logs", label: "Daily Logs",  icon: NotebookPen },
  { href: "/admin/prompts",    label: "AI Prompts",  icon: SlidersHorizontal },
  { href: "/admin/issues",     label: "Issues",      icon: AlertTriangle },
  { href: "/admin/errors",     label: "Errors",      icon: Bug },
  { href: "/admin/health",     label: "Health",      icon: Activity },
];

export function Sidebar({ user, client, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [confirmLogout, setConfirmLogout] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const isSuperAdmin = user.role === "super_admin";
  const links = isSuperAdmin
    ? adminLinks
    : user.role === "client_admin"
      ? clientAdminLinks
      : vaLinks;

  const initials = user.full_name
    ? user.full_name.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase()
    : user.email.slice(0, 2).toUpperCase();

  return (
    <>
      <aside className="flex flex-col w-60 min-h-screen bg-zinc-900 border-r border-zinc-800 px-4 py-6 gap-6 shrink-0">
        {/* Brand */}
        <div>
          <div className="flex items-center justify-between">
            <span className="font-bold text-white text-xl tracking-tight leading-none">Rapid<span className="text-orange-500">Tal</span></span>
            <NotificationsBell userId={user.id} />
          </div>
          {isSuperAdmin ? (
            <div className="mt-1 flex items-center gap-2 text-xs text-amber-400 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              Super Admin
            </div>
          ) : (
            <p className="mt-1 text-xs text-zinc-400 truncate">{client?.name ?? "—"}</p>
          )}
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1 flex-1 overflow-y-auto">
          {links.map((item) =>
            "section" in item ? (
              <p key={`s-${item.section}`} className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                {item.section}
              </p>
            ) : (
              (() => {
                // "/admin" is exact-only, otherwise it would highlight on every /admin/* page.
                const isActive = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href + "/"));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border-l-2",
                      isActive
                        ? "border-orange-500 bg-orange-500/10 text-orange-300"
                        : "border-transparent text-zinc-400 hover:bg-zinc-800 hover:text-white"
                    )}
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })()
            )
          )}
        </nav>

        {/* User footer */}
        <div className="flex flex-col gap-2 border-t border-zinc-800 pt-4">
          <div className="flex items-center gap-3 px-1">
            <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-200 shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              {user.full_name && <p className="text-xs font-medium text-zinc-200 truncate">{user.full_name}</p>}
              <p className="text-xs text-zinc-500 truncate">{user.email}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmLogout(true)}
            className="justify-start text-zinc-400 hover:text-red-400 px-3"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Logout confirmation overlay */}
      {confirmLogout && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-modal">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-6 py-5 w-80 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-base">Sign out?</h2>
              <button onClick={() => setConfirmLogout(false)} className="text-zinc-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-zinc-400 mb-5">
              You&apos;ll be signed out of your session. Any unsaved work will be lost.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setConfirmLogout(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={signOut}
                className="bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30"
              >
                <LogOut className="w-3.5 h-3.5 mr-1.5" />
                Sign out
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
