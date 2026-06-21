"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Bell, CheckCheck, Loader2 } from "lucide-react";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  read_at: string | null;
  created_at: string;
}

function relTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

export function NotificationsBell({ userId }: { userId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const supabaseRef = useRef(createClient());
  const panelRef = useRef<HTMLDivElement>(null);
  // The sidebar mounts twice (desktop + mobile drawer), so each bell needs its
  // own channel topic — Supabase rejects a second subscribe() on the same topic.
  const channelId = useRef(Math.random().toString(36).slice(2));

  const load = useCallback(async () => {
    try {
      const d = await api.get<{ notifications: Notification[]; unread: number }>(
        ROUTES.notifications(), { showErrorToast: false },
      );
      setItems(d.notifications);
      setUnread(d.unread);
    } catch { /* silent — badge just stays stale */ }
  }, []);

  // Initial load + refresh on focus, live INSERTs via Realtime.
  useEffect(() => {
    void load();
    const onFocus = () => { void load(); };
    window.addEventListener("focus", onFocus);

    const supabase = supabaseRef.current;
    const channel = supabase
      .channel(`notifications:${userId}:${channelId.current}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new as Notification;
          setItems((p) => (p.some((x) => x.id === n.id) ? p : [n, ...p].slice(0, 30)));
          setUnread((u) => u + 1);
        },
      )
      .subscribe();

    return () => {
      window.removeEventListener("focus", onFocus);
      void supabase.removeChannel(channel);
    };
  }, [userId, load]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function openItem(n: Notification) {
    setOpen(false);
    if (!n.read_at) {
      setItems((p) => p.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      setUnread((u) => Math.max(0, u - 1));
      void api.patch(ROUTES.notifications(), { id: n.id }, { showErrorToast: false }).catch(() => {});
    }
    if (n.href) router.push(n.href);
  }

  async function markAllRead() {
    setLoading(true);
    try {
      await api.patch(ROUTES.notifications(), { all: true }, { showErrorToast: false });
      setItems((p) => p.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })));
      setUnread(0);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((s) => !s)}
        title="Notifications"
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
        aria-expanded={open}
        className="relative p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-3xs font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-80 max-h-[420px] overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl z-50">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-zinc-800 sticky top-0 bg-zinc-900">
            <p className="text-sm font-semibold text-zinc-100">Notifications</p>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                disabled={loading}
                className="inline-flex items-center gap-1 text-2xs text-zinc-400 hover:text-white transition-colors"
              >
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />}
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-8">Nothing yet — you&apos;re all caught up.</p>
          ) : (
            <div className="divide-y divide-zinc-800">
              {items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => void openItem(n)}
                  className={cn(
                    "w-full text-left px-3.5 py-2.5 hover:bg-zinc-800/60 transition-colors",
                    !n.read_at && "bg-blue-500/5",
                  )}
                >
                  <div className="flex items-start gap-2">
                    {!n.read_at && <span className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm leading-snug", n.read_at ? "text-zinc-400" : "text-zinc-100 font-medium")}>
                        {n.title}
                      </p>
                      {n.body && <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{n.body}</p>}
                    </div>
                    <span className="text-3xs text-zinc-600 shrink-0 mt-0.5">{relTime(n.created_at)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
