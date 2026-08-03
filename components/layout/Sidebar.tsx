"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { DbUser, DbClient } from "@/types/database";
import {
  LayoutDashboard,
  Building2,
  Users,
  Archive,
  LogOut,
  ListChecks,
  PenLine,
  NotebookPen,
  Brain,
  Sparkles,
  KeyRound,
  Handshake,
  Bug,
  SlidersHorizontal,
  MonitorPlay,
  Briefcase,
  AlertTriangle,
  Activity,
  TrendingUp,
  Wallet,
  LibraryBig,
  ChevronDown,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "./NotificationsBell";
import { useSupabase } from "@/hooks/useSupabase";
import { CLIENT_NAVIGATION_DESTINATIONS, clientDestinationsForGroup } from "@/lib/client-navigation";

type NavItem =
  | { href: string; label: string; icon: LucideIcon }
  | { section: string }
  | {
      group: string;
      icon: LucideIcon;
      children: { href: string; label: string; paths?: string[] }[];
    };

interface SidebarProps {
  user: DbUser;
  client: DbClient | null;
  onNavigate?: () => void;
}

const clientWorkGroup = {
  group: "Work",
  icon: Briefcase,
  children: clientDestinationsForGroup("Work").map(({ href, label, paths }) => ({ href, label, paths })),
} satisfies NavItem;

const clientCreateGroup = {
  group: "Create",
  icon: PenLine,
  children: clientDestinationsForGroup("Create").map(({ href, label, paths }) => ({ href, label, paths })),
} satisfies NavItem;

const clientGrowGroup = {
  group: "Grow",
  icon: TrendingUp,
  children: clientDestinationsForGroup("Grow").map(({ href, label, paths }) => ({ href, label, paths })),
} satisfies NavItem;

const clientCompanyGroup = {
  group: "Company",
  icon: Building2,
  children: clientDestinationsForGroup("Company").map(({ href, label, paths }) => ({ href, label, paths })),
} satisfies NavItem;

const clientSettingsGroup = {
  group: "Settings",
  icon: SlidersHorizontal,
  children: clientDestinationsForGroup("Settings").map(({ href, label, paths }) => ({ href, label, paths })),
} satisfies NavItem;

function clientStandaloneLink(label: "Home" | "Coach" | "Access", icon: LucideIcon): NavItem {
  const destination = CLIENT_NAVIGATION_DESTINATIONS.find((item) => item.label === label);
  if (!destination) throw new Error(`Missing client navigation destination: ${label}`);
  return { href: destination.href, label: destination.label, icon };
}

const vaWorkGroup = {
  group: "Work",
  icon: Briefcase,
  children: [
    { href: "/tasks", label: "Tasks" },
    { href: "/messages", label: "Messages" },
    { href: "/notebook", label: "Notebook" },
    { href: "/daily-log", label: "Daily log" },
    { href: "/my-job", label: "My job" },
    { href: "/sops", label: "Procedures" },
    { href: "/tools", label: "Tools" },
  ],
} satisfies NavItem;

const vaLinks: NavItem[] = [
  clientStandaloneLink("Home", LayoutDashboard),
  vaWorkGroup,
  clientCreateGroup,
  clientGrowGroup,
  clientCompanyGroup,
  clientStandaloneLink("Coach", Sparkles),
  clientStandaloneLink("Access", KeyRound),
  clientSettingsGroup,
];

// Client-first navigation exposes goals, not the application's internal
// architecture. Detailed Brain, style-analysis and Q&A controls remain
// reachable inside Company pages without competing in the primary sidebar.
const clientAdminLinks: NavItem[] = [
  clientStandaloneLink("Home", LayoutDashboard),
  clientWorkGroup,
  clientCreateGroup,
  clientGrowGroup,
  clientCompanyGroup,
  clientStandaloneLink("Coach", Sparkles),
  clientStandaloneLink("Access", KeyRound),
  clientSettingsGroup,
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
  // Only the active goal group expands by default; explicit toggles persist in
  // this browser, while the group owning the current page always remains open.
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (user.role === "super_admin") return;
    try {
      const saved = JSON.parse(localStorage.getItem(`rapidtal:client-nav-groups:${user.id}`) ?? "null") as Record<string, unknown> | null;
      if (!saved) return;
      setCollapsedGroups(Object.fromEntries(
        Object.entries(saved).filter(([, value]) => typeof value === "boolean"),
      ) as Record<string, boolean>);
    } catch { /* Browser storage is optional. */ }
  }, [user.id, user.role]);

  function setGroupCollapsed(group: string, collapsed: boolean) {
    setCollapsedGroups((previous) => {
      const next = { ...previous, [group]: collapsed };
      if (user.role !== "super_admin") {
        try { localStorage.setItem(`rapidtal:client-nav-groups:${user.id}`, JSON.stringify(next)); } catch { /* ignore */ }
      }
      return next;
    });
  }

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
          {!isSuperAdmin && (
            <button
              type="button"
              onClick={() => {
                onNavigate?.();
                if (window.matchMedia?.("(max-width: 767px)").matches) {
                  document.querySelector<HTMLElement>('[aria-label="Open navigation"]')?.focus();
                }
                window.dispatchEvent(new Event("rapidtal:open-client-navigation"));
              }}
              className="mb-2 flex w-full items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2.5 text-left text-xs text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-100"
              aria-label="Search and jump to a feature"
            >
              <Search className="h-4 w-4" />
              <span className="flex-1">Search or jump to…</span>
              <kbd className="rounded border border-zinc-700 px-1.5 py-0.5 font-mono text-3xs text-zinc-500">⌘/Ctrl K</kbd>
            </button>
          )}
          {links.map((item) =>
            "section" in item ? (
              <p key={`s-${item.section}`} className="font-mono text-3xs font-bold uppercase tracking-[0.16em] text-zinc-500 px-2.5 pt-4 pb-1.5">
                {item.section}
              </p>
            ) : "group" in item ? (
              (() => {
                const matchingChild = item.children
                  .filter((child) => (child.paths ?? [child.href]).some(
                    (path) => pathname === path || pathname.startsWith(path + "/"),
                  ))
                  .sort((a, b) => Math.max(...(b.paths ?? [b.href]).map((path) => path.length)) - Math.max(...(a.paths ?? [a.href]).map((path) => path.length)))[0];
                const groupActive = Boolean(matchingChild);
                // Keep the information architecture calm. The current goal
                // area is always visible; choices for inactive groups persist.
                const collapsed = groupActive ? false : (collapsedGroups[item.group] ?? true);
                return (
                  <div key={`g-${item.group}`}>
                    <button
                      type="button"
                      onClick={() => setGroupCollapsed(item.group, !collapsed)}
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
                          const childActive = child.href === matchingChild?.href;
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
