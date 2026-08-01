"use client";

import { useState } from "react";
import { Eye, X, Loader2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";

/**
 * Sticky banner shown while a super_admin is viewing the app as another user.
 * "Exit" clears the impersonation cookie and returns to the admin users page.
 */
export function ImpersonationBanner({
  viewingName,
  viewingRole,
  adminEmail,
}: {
  viewingName: string;
  viewingRole: string;
  adminEmail: string;
}) {
  const [exiting, setExiting] = useState(false);

  async function exit() {
    setExiting(true);
    try {
      await api.delete(ROUTES.admin.impersonate(), undefined, { showErrorToast: false });
    } finally {
      // Full reload so every server component re-resolves the real user.
      window.location.href = "/admin/users";
    }
  }

  return (
    <div className="sticky top-0 z-50 flex items-center gap-3 bg-amber-500 text-amber-950 px-4 py-2 text-sm font-medium">
      <Eye className="w-4 h-4 shrink-0" />
      <span className="flex-1 min-w-0 truncate">
        Viewing as <strong>{viewingName}</strong> ({viewingRole}) — signed in as {adminEmail}
      </span>
      <button
        onClick={exit}
        disabled={exiting}
        className="inline-flex items-center gap-1.5 rounded-md bg-amber-950/10 hover:bg-amber-950/20 px-2.5 py-1 transition-colors disabled:opacity-50 shrink-0"
      >
        {exiting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
        Exit
      </button>
    </div>
  );
}
