"use client";

import { useEffect, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { cn } from "@/lib/utils";
import { categoriesForRole, type NotificationPrefs, type NotifChannel } from "@/lib/notification-categories";

/** Per-user notification preferences: which categories you get, in-app and/or
 *  by email. Defaults are ON, so a fresh user sees everything enabled. */
export function NotificationSettings({ role }: { role: string }) {
  const cats = categoriesForRole(role);
  const [prefs, setPrefs] = useState<NotificationPrefs>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    api.get<{ prefs: NotificationPrefs }>(ROUTES.profileNotifications(), { showErrorToast: false })
      .then((d) => { if (active) setPrefs(d.prefs ?? {}); })
      .catch(() => { /* keep defaults */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const isOn = (key: string, ch: NotifChannel) => prefs[key]?.[ch] !== false;

  async function toggle(key: string, ch: NotifChannel) {
    const next: NotificationPrefs = {
      ...prefs,
      [key]: { in_app: isOn(key, "in_app"), email: isOn(key, "email"), [ch]: !isOn(key, ch) },
    };
    const prev = prefs;
    setPrefs(next);
    setSaving(true);
    try {
      await api.patch(ROUTES.profileNotifications(), { prefs: next });
    } catch {
      setPrefs(prev); // api-client toasts; roll back
    } finally {
      setSaving(false);
    }
  }

  if (cats.length === 0) return null;

  return (
    <section className="surface-card p-5">
      <div className="flex items-center gap-2 mb-1">
        <Bell className="w-4 h-4 text-zinc-400" />
        <h2 className="text-lg font-semibold text-white flex-1">Notifications</h2>
        {saving && <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />}
      </div>
      <p className="text-sm text-zinc-400 mb-4">Choose what you&apos;re notified about, and how. Email needs your address on file.</p>

      {loading ? (
        <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
      ) : (
        <div className="flex flex-col">
          {/* Column headers */}
          <div className="flex items-center gap-3 pb-2 border-b border-zinc-800">
            <span className="flex-1" />
            <span className="w-12 text-center text-2xs uppercase tracking-wide text-zinc-500">In-app</span>
            <span className="w-12 text-center text-2xs uppercase tracking-wide text-zinc-500">Email</span>
          </div>
          {cats.map((c) => (
            <div key={c.key} className="flex items-center gap-3 py-3 border-b border-zinc-800/60 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-200">{c.label}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{c.description}</p>
              </div>
              <div className="w-12 flex justify-center">
                <Toggle on={isOn(c.key, "in_app")} onClick={() => toggle(c.key, "in_app")} label={`${c.label} — in-app`} />
              </div>
              <div className="w-12 flex justify-center">
                <Toggle on={isOn(c.key, "email")} onClick={() => toggle(c.key, "email")} label={`${c.label} — email`} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={cn("relative w-9 h-5 rounded-full transition-colors shrink-0", on ? "bg-green-500/80" : "bg-zinc-700")}
    >
      <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform", on && "translate-x-4")} />
    </button>
  );
}
