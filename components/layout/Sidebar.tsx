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
  BookOpen,
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
  Bug,
  Wrench,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "./NotificationsBell";

interface SidebarProps {
  user: DbUser;
  client: DbClient | null;
  onNavigate?: () => void;
}

const vaLinks = [
  { href: "/dashboard",      label: "Dashboard",      icon: LayoutDashboard },
  { href: "/company-report", label: "Company Report", icon: Brain },
  { href: "/ask",            label: "Ask the Vault",  icon: Sparkles },
  { href: "/compose",        label: "Compose",        icon: Wand2 },
  { href: "/tasks",          label: "Tasks",          icon: KanbanSquare },
  { href: "/tools",          label: "Tools",          icon: Wrench },
  { href: "/access",         label: "Access",         icon: KeyRound },
  { href: "/daily-log",      label: "Daily Log",      icon: NotebookPen },
  { href: "/messages",       label: "Messages",       icon: MessageSquare },
  { href: "/knowledge-base", label: "Knowledge Base", icon: BookOpen },
  { href: "/crm",            label: "CRM",            icon: ContactRound },
  { href: "/content",        label: "Content",        icon: PenLine },
  { href: "/sops",           label: "SOPs",           icon: ListChecks },
  { href: "/company-dna",    label: "Company DNA",    icon: Dna },
  { href: "/vault",          label: "Vault",          icon: Archive },
  { href: "/profile",        label: "My Profile",     icon: UserCircle },
];

const clientAdminLinks = [
  { href: "/dashboard",      label: "Dashboard",       icon: LayoutDashboard },
  { href: "/company-report", label: "Company Report",  icon: Brain },
  { href: "/ask",            label: "Ask the Vault",   icon: Sparkles },
  { href: "/compose",        label: "Compose",         icon: Wand2 },
  { href: "/brain-analytics",label: "Brain Analytics", icon: BarChart3 },
  { href: "/supervision",    label: "Supervision",     icon: Eye },
  { href: "/tasks",          label: "Tasks",           icon: KanbanSquare },
  { href: "/tools",          label: "Tools",           icon: Wrench },
  { href: "/access",         label: "Access",          icon: KeyRound },
  { href: "/team",           label: "My Team",         icon: UsersRound },
  { href: "/messages",       label: "Messages",       icon: MessageSquare },
  { href: "/daily-log",      label: "Daily Log",      icon: NotebookPen },
  { href: "/knowledge-base", label: "Knowledge Base", icon: BookOpen },
  { href: "/crm",            label: "CRM",            icon: ContactRound },
  { href: "/content",        label: "Content",        icon: PenLine },
  { href: "/sops",           label: "SOPs",           icon: ListChecks },
  { href: "/company-dna",    label: "Company DNA",    icon: Dna },
  { href: "/vault",          label: "Vault",          icon: Archive },
  { href: "/profile",        label: "My Profile",     icon: UserCircle },
];

const adminLinks = [
  { href: "/admin",            label: "Overview",    icon: LayoutDashboard },
  { href: "/admin/clients",    label: "Clients",     icon: Building2 },
  { href: "/admin/users",      label: "All Users",   icon: Users },
  { href: "/admin/sops",       label: "SOP Library", icon: ListChecks },
  { href: "/admin/vault",      label: "Client Vaults", icon: Archive },
  { href: "/admin/ask",        label: "Ask as Client", icon: Sparkles },
  { href: "/access",           label: "Access",      icon: KeyRound },
  { href: "/supervision",      label: "Supervision", icon: Eye },
  { href: "/admin/daily-logs", label: "Daily Logs",  icon: NotebookPen },
  { href: "/admin/errors",     label: "Errors",      icon: Bug },
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
            <span className="font-bold text-white text-xl tracking-tight leading-none">RapidTal</span>
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
        <nav className="flex flex-col gap-1 flex-1">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                // "/admin" is exact-only, otherwise it would highlight on every /admin/* page.
                pathname === href || (href !== "/admin" && pathname.startsWith(href + "/"))
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          ))}
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
