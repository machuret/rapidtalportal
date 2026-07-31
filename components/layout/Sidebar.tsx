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
  ContactRound,
  ListChecks,
  PenLine,
  NotebookPen,
  UserCircle,
  UsersRound,
  MessageSquare,
  Brain,
  Sparkles,
  BarChart3,
  Eye,
  KanbanSquare,
  KeyRound,
  Notebook,
  Handshake,
  Bug,
  Wrench,
  SlidersHorizontal,
  MonitorPlay,
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
  { section: "Team & work" },
  { href: "/tasks",          label: "Tasks",          icon: KanbanSquare },
  { href: "/messages",       label: "Messages",       icon: MessageSquare },
  { href: "/notebook",       label: "Notebook",       icon: Notebook },
  { href: "/access",         label: "Access",         icon: KeyRound },
  { href: "/daily-log",      label: "Daily Log",      icon: NotebookPen },
  { href: "/crm",            label: "CRM",            icon: ContactRound },
  { section: "Knowledge & content" },
  { href: "/content",        label: "Content Studio", icon: PenLine },
  { href: "/ask",            label: "Ask the Vault",  icon: Sparkles },
  { href: "/vault",          label: "Vault",          icon: Archive },
  { href: "/company-dna",    label: "Company DNA",    icon: Dna },
  { href: "/company-report", label: "Company Report", icon: Brain },
  { section: "Tools" },
  { href: "/tools",          label: "Tools",           icon: Wrench },
  { href: "/sops",           label: "SOPs",           icon: ListChecks },
  { href: "/my-job",         label: "My Job",         icon: Briefcase },
  { section: "Account" },
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
  { href: "/content",        label: "Content Studio",  icon: PenLine },
  { href: "/access",         label: "Access",          icon: KeyRound },
  { section: "Account" },
  { href: "/guide",          label: "Guide",           icon: BookOpen },
  { href: "/profile",        label: "My Profile",      icon: UserCircle },
];

const adminLinks: NavItem[] = [
  { href: "/admin",            label: "Overview",    icon: LayoutDashboard },
  { href: "/brain",            label: "Company Brains", icon: Brain },
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
  { href: "/admin/tutorials",  label: "Tutorials",   icon: MonitorPlay },
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

  const roleBadge = isSuperAdmin ? "ADMIN" : user.role === "client_admin" ? "CLIENT" : "VA";
  const roleLabel = isSuperAdmin ? "Super Admin" : user.role === "client_admin" ? (client?.name ?? "Client") : (client?.name ?? "Virtual Assistant");

  return (
    <>
      <aside className="flex flex-col w-[264px] min-h-screen bg-zinc-900 border-r border-zinc-800 shrink-0">
        {/* Brand header */}
        <div className="h-16 shrink-0 flex items-center gap-3 px-5 border-b border-zinc-800">
          <span className="w-[9px] h-[9px] rounded-full bg-orange-500 shadow-[0_0_12px_rgb(var(--orange-500))] shrink-0" />
          <span className="font-display text-2xl tracking-[0.08em] leading-none text-zinc-50">RAPID TAL</span>
          <span className="font-mono text-3xs font-semibold tracking-[0.12em] text-orange-500 bg-orange-500/10 px-1.5 py-0.5 rounded-md">{roleBadge}</span>
          <span className="ml-auto"><NotificationsBell userId={user.id} /></span>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-0.5 flex-1 overflow-y-auto px-3.5 py-4">
          {links.map((item) =>
            "section" in item ? (
              <p key={`s-${item.section}`} className="font-mono text-3xs font-bold uppercase tracking-[0.16em] text-zinc-500 px-2.5 pt-4 pb-1.5">
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
                      "relative flex items-center gap-3 px-2.5 py-2.5 rounded-md text-xs font-semibold transition-colors",
                      isActive
                        ? "bg-orange-500/10 text-orange-500"
                        : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-50"
                    )}
                  >
                    {isActive && <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-[3px] h-[18px] rounded-r-md bg-orange-500" />}
                    <item.icon className="w-[18px] h-[18px] shrink-0" />
                    {item.label}
                  </Link>
                );
              })()
            )
          )}
        </nav>

        {/* User footer card */}
        <div className="shrink-0 border-t border-zinc-800 p-3.5 flex items-center gap-3">
          <Link href="/profile" onClick={onNavigate} className="flex items-center gap-3 min-w-0 flex-1 group">
            <span className="w-9 h-9 shrink-0 rounded-lg bg-gradient-to-br from-orange-500 to-orange-400 flex items-center justify-center text-xs font-bold text-white">
              {initials}
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-bold text-zinc-50 truncate group-hover:text-orange-500 transition-colors">{user.full_name ?? user.email}</span>
              <span className="block text-2xs text-zinc-500 truncate">{roleLabel}</span>
            </span>
          </Link>
          <button
            onClick={() => setConfirmLogout(true)}
            title="Sign out"
            aria-label="Sign out"
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Logout confirmation overlay */}
      {confirmLogout && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-modal">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="logout-title"
            className="bg-zinc-900 border border-zinc-700 rounded-xl px-6 py-5 w-full max-w-xs mx-4 shadow-xl"
          >
            <div className="flex items-center justify-between mb-3">
              <h2 id="logout-title" className="font-semibold text-base">Sign out?</h2>
              <button onClick={() => setConfirmLogout(false)} aria-label="Close sign-out dialog" className="text-zinc-500 hover:text-white">
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
