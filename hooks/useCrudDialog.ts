"use client";

import { useState } from "react";
import { toast } from "sonner";

/**
 * Shared save / archive plumbing for the admin CRUD edit dialogs (leads,
 * expenses, …). Their field layouts differ too much to share JSX, but the
 * stateful part is identical: a single `busy` flag, a guarded save that closes
 * on success, and an optional confirm-then-archive — with error toasts left to
 * the api client (no double-toast) and success toasts surfaced here. Pulling it
 * into one hook keeps that behaviour consistent and tested across dialogs.
 */
export function useCrudDialog(opts: {
  mode: "create" | "edit";
  onClose: () => void;
  onSubmit: () => Promise<unknown>;
  onArchive?: () => Promise<void>;
  messages?: { created?: string; saved?: string; archived?: string };
  /** Return confirmation text to prompt before archiving, or null to skip. */
  archiveConfirm?: () => string | null;
  /** Guard the save button beyond the busy flag (e.g. required fields). */
  canSave?: () => boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function save() {
    if (busy || (opts.canSave && !opts.canSave())) return;
    setBusy(true);
    try {
      await opts.onSubmit();
      const msg = opts.mode === "create" ? opts.messages?.created : opts.messages?.saved;
      if (msg) toast.success(msg);
      opts.onClose();
    } catch {
      /* api-client owns the error toast */
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (busy || !opts.onArchive) return;
    const confirmText = opts.archiveConfirm?.();
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true);
    try {
      await opts.onArchive();
      if (opts.messages?.archived) toast.success(opts.messages.archived);
    } catch {
      /* api-client owns the error toast */
    } finally {
      setBusy(false);
    }
  }

  return { busy, save, archive };
}
