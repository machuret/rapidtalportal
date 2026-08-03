"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
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
  const [desktop, setDesktop] = useState(true);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const drawerHidden = !desktop && !open;

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!open || desktop) return;
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [desktop, open]);

  useEffect(() => {
    if (drawerHidden) drawerRef.current?.setAttribute("inert", "");
    else drawerRef.current?.removeAttribute("inert");
  }, [drawerHidden]);

  function closeNavigation(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => openButtonRef.current?.focus());
  }

  function containDrawerFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (desktop || !open || !drawerRef.current) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeNavigation(true);
      return;
    }
    if (event.key !== "Tab") return;
    const controls = Array.from(drawerRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ));
    if (controls.length === 0) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <button
        ref={openButtonRef}
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
          onClick={() => closeNavigation(true)}
          aria-hidden="true"
        />
      )}

      {/* The one and only sidebar: static column on md+, drawer on mobile. */}
      <div
        ref={drawerRef}
        role={!desktop && open ? "dialog" : undefined}
        aria-modal={!desktop && open ? true : undefined}
        aria-label={!desktop && open ? "Portal navigation" : undefined}
        aria-hidden={drawerHidden ? true : undefined}
        onKeyDown={containDrawerFocus}
        className={`fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-out md:static md:translate-x-0 md:z-auto md:transition-none ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="relative h-full">
          <button
            ref={closeButtonRef}
            onClick={() => closeNavigation(true)}
            className="md:hidden absolute top-4 right-[-40px] w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
            aria-label="Close navigation"
          >
            <X className="w-4 h-4" />
          </button>
          <Sidebar user={user} client={client} onNavigate={() => closeNavigation(false)} />
        </div>
      </div>
    </>
  );
}
