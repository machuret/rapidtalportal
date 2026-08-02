"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  LibraryBig,
  ChevronDown,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "./NotificationsBell";
import { useSupabase } from "@/hooks/useSupabase";

type NavItem =
  | { href: string; label: string; icon: LucideIcon }
  | { section: string }
  | {
      group: string;
      icon: LucideIcon;
      /** Route prefix — the group auto-expands and highlights when active. */
      base: string;
      children: { href: string; label: string }[];
    };

interface SidebarProps {
  user: DbUser;
  client: DbClient | null;
  onNavigate?: () => void;
}

const contentGroup = {
  group: "Content",
  icon: PenLine,
  base: "/content",
  children: [
    { href: "/content/quick", label: "Quick Draft" },
    { href: "/content/ideas", label: "Ideas" },
    { href: "/content/competitors", label: "Competitor Ideas" },
    { href: "/content/projects", label: "Projects" },
    { href: "/content/library", label: "Drafts & Approved" },
    { href: "/content/style", label: "Content Style" },
  ],
} satisfies NavItem;

const dnaGroup = {
  group: "Company DNA",
  icon: Dna,
  base: "/company-dna",
  children: [
    { href: "/company-dna", label: "Profile" },
    { href: "/company-dna/competitors", label: "Competitors" },
  ],
} satisfies NavItem;

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
  contentGroup,
  dnaGroup,
  { href: "/ask",            label: "RapidTal Coach", icon: Sparkles },
  { href: "/vault",          label: "Vault",          icon: Archive },
  { href: "/brain",          label: "Company Brain",  icon: Brain },
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
// Content and Company DNA are expandable groups: each content concern (draft,
// ideas, competitors, projects, library, style) and each DNA concern (profile,
// competitors) is one deep-linkable page instead of one crowded scroll.
const clientAdminLinks: NavItem[] = [
  { href: "/dashboard",      label: "Dashboard",       icon: LayoutDashboard },
  { section: "Team & work" },
  { href: "/tasks",          label: "Tasks",           icon: KanbanSquare },
  { href: "/messages",       label: "Messages",        icon: MessageSquare },
  { href: "/notebook",       label: "Notebook",        icon: Notebook },
  { href: "/team",           label: "My Team",         icon: UsersRound },
  { href: "/reports",        label: "Reports",         icon: FileBarChart },
  { section: "Content & brand" },
  contentGroup,
  dnaGroup,
  { section: "Your AI & knowledge" },
  { href: "/vault",          label: "Vault",           icon: Archive },
  { href: "/ask",            label: "RapidTal Coach",  icon: Sparkles },
  { href: "/brain",          label: "Company Brain",   icon: Brain },
  { section: "Tools" },
  { href: "/crm",            label: "CRM",             icon: ContactRound },
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
  { href: "/admin/library",     label: "Business Library", icon: LibraryBig },
  { href: "/admin/vault",      label: "Client Vaults", icon: Archive },
  { href: "/admin/ask",        label: "Ask as Client", icon: Sparkles },
  { href: "/access",           label: "Access",      icon: KeyRound },
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
  const supabase = useSupabase();
  const [confirmLogout, setConfirmLogout] = useState(false);
  // Groups start expanded for discoverability; toggling collapses per group.
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

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
            ) : "group" in item ? (
              (() => {
                const groupActive = pathname === item.base || pathname.startsWith(item.base + "/");
                const collapsed = !!collapsedGroups[item.group];
                return (
                  <div key={`g-${item.group}`}>
                    <button
                      type="button"
                      onClick={() => setCollapsedGroups((prev) => ({ ...prev, [item.group]: !collapsed }))}
                      aria-expanded={!collapsed}
                      className={cn(
                        "relative flex w-full items-center gap-3 px-2.5 py-2.5 rounded-md text-xs font-semibold transition-colors",
                        groupActive
                          ? "bg-orange-500/10 text-orange-500"
                          : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-50"
                      )}
                    >
                      {groupActive && <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-[3px] h-[18px] rounded-r-md bg-orange-500" />}
                      <item.icon className="w-[18px] h-[18px] shrink-0" />
                      {item.group}
                      <ChevronDown className={cn("ml-auto w-3.5 h-3.5 transition-transform", collapsed && "-rotate-90")} />
                    </button>
                    {!collapsed && (
                      <div className="ml-6 flex flex-col gap-0.5 border-l border-zinc-800 pl-3 pb-1">
                        {item.children.map((child) => {
                          const childActive = child.href === item.base
                            ? pathname === child.href
                            : pathname === child.href || pathname.startsWith(child.href + "/");
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              prefetch={false}
                              onClick={onNavigate}
                              aria-current={childActive ? "page" : undefined}
                              className={cn(
                                "rounded-md px-2.5 py-2 text-xs font-medium transition-colors",
                                childActive
                                  ? "bg-orange-500/10 text-orange-500"
                                  : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
                              )}
                            >
                              {child.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              (() => {
                // "/admin" is exact-only, otherwise it would highlight on every /admin/* page.
                const isActive = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href + "/"));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
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
