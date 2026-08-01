"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Sidebar } from "./Sidebar";
import type { DbUser, DbClient } from "@/types/database";

/**
 * ONE sidebar instance for both desktop and mobile. Previously the desktop
 * column and the (off-screen) mobile drawer each mounted a full Sidebar —
 * doubling nav-link prefetch fan-out and running two NotificationsBell
 * realtime channels. On md+ this container is the static column; on mobile
 * it's the off-canvas drawer.
 */
export function SidebarShell({ user, client }: { user: DbUser; client: DbClient | null }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-4 left-4 z-50 w-9 h-9 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
        aria-label="Open navigation"
      >
        <Menu className="w-4 h-4" />
      </button>

      {/* Backdrop (mobile only) */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-zinc-950/80 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* The one and only sidebar: static column on md+, drawer on mobile. */}
      <div
        className={`fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-out md:static md:translate-x-0 md:z-auto md:transition-none ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="relative h-full">
          <button
            onClick={() => setOpen(false)}
            className="md:hidden absolute top-4 right-[-40px] w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
            aria-label="Close navigation"
          >
            <X className="w-4 h-4" />
          </button>
          <Sidebar user={user} client={client} onNavigate={() => setOpen(false)} />
        </div>
      </div>
    </>
  );
}
