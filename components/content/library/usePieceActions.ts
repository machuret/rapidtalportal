"use client";

import { useCallback, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { useUpdateContentPiece, useUpdatePieceStatus } from "@/hooks/useContent";
import type { ContentPieceFull } from "@/hooks/useContent";
import type { ContentPiece, ContentStatus, ContentType } from "@/types/content";
import type { EditorialLearningSuggestion } from "../EditorialLearningPrompt";

/* ── Mutations for the piece detail editor ────────────────────────
   Error toasts are owned by the shared API client / mutation hooks
   (including 4xx and 409 conflicts) — the catch blocks below stay
   empty on purpose and must not grow local error toasts. */
interface UsePieceActionsParams {
  piece: ContentPieceFull;
  clientId: string;
  body: string;
  persistedBody: string;
  currentUpdatedAt: string;
  dirty: boolean;
  adaptType: ContentType;
  editorRef: RefObject<HTMLTextAreaElement>;
  setBody: Dispatch<SetStateAction<string>>;
  setPersistedBody: Dispatch<SetStateAction<string>>;
  setCurrentUpdatedAt: Dispatch<SetStateAction<string>>;
  setEditing: Dispatch<SetStateAction<boolean>>;
  setLearningSuggestion: Dispatch<SetStateAction<EditorialLearningSuggestion | null>>;
  loadRevisions: () => Promise<void>;
  onPieceChanged: (piece: ContentPieceFull) => void;
  onStatusChanged: (id: string, status: ContentStatus) => void;
  onArtifactCreated: (piece: ContentPiece) => void;
}

export function usePieceActions({
  piece,
  clientId,
  body,
  persistedBody,
  currentUpdatedAt,
  dirty,
  adaptType,
  editorRef,
  setBody,
  setPersistedBody,
  setCurrentUpdatedAt,
  setEditing,
  setLearningSuggestion,
  loadRevisions,
  onPieceChanged,
  onStatusChanged,
  onArtifactCreated,
}: UsePieceActionsParams) {
  const [copied, setCopied] = useState(false);
  const [rewriteInstruction, setRewriteInstruction] = useState("");
  const [rewriting, setRewriting] = useState(false);
  const [derivedAction, setDerivedAction] = useState<"duplicate" | "adapt" | null>(null);
  const [lifecycleNotice, setLifecycleNotice] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const derivedActionRef = useRef<"duplicate" | "adapt" | null>(null);

  const { updateStatus, isUpdating } = useUpdatePieceStatus();
  const { updatePiece, isUpdating: isSavingDraft } = useUpdateContentPiece();

  const handleCopy = useCallback(async () => {
    if (!body) return;
    await navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [body]);

  const saveDraft = useCallback(async () => {
    try {
      const updated = await updatePiece({
        client_id: clientId,
        id: piece.id,
        body,
        expected_updated_at: currentUpdatedAt || undefined,
      });
      setPersistedBody(updated.body ?? "");
      setCurrentUpdatedAt(updated.updated_at ?? "");
      setLearningSuggestion(updated.learning_suggestion ?? null);
      onPieceChanged(updated);
      setEditing(false);
      await loadRevisions();
      toast.success("Draft saved.");
      if (updated.editorial_warning) {
        toast.warning("Draft saved, but its editorial learning record needs attention.");
      }
    } catch {
      // mutation surfaces the error
    }
  }, [updatePiece, clientId, piece.id, body, currentUpdatedAt, loadRevisions, onPieceChanged, setPersistedBody, setCurrentUpdatedAt, setLearningSuggestion, setEditing]);

  const rewrite = useCallback(async (scope: "full" | "section") => {
    if (!rewriteInstruction.trim()) return;
    const element = editorRef.current;
    const selectedText = element && element.selectionEnd > element.selectionStart
      ? body.slice(element.selectionStart, element.selectionEnd)
      : "";
    const selectionStart = element?.selectionStart ?? 0;
    const selectionEnd = element?.selectionEnd ?? 0;
    if (scope === "section" && !selectedText) {
      toast.error("Select the section you want to rewrite first.");
      return;
    }
    setRewriting(true);
    try {
      const result = await api.post<ContentPieceFull>(ROUTES.content.rewrite(), {
        client_id: clientId,
        id: piece.id,
        scope,
        instruction: rewriteInstruction.trim(),
        expected_updated_at: currentUpdatedAt,
        selectedText: scope === "section" ? selectedText : undefined,
        selectionStart: scope === "section" ? selectionStart : undefined,
        selectionEnd: scope === "section" ? selectionEnd : undefined,
      });
      setBody(result.body ?? "");
      setPersistedBody(result.body ?? "");
      setCurrentUpdatedAt(result.updated_at ?? "");
      onPieceChanged(result);
      setEditing(true);
      setRewriteInstruction("");
      await loadRevisions();
      toast.success(scope === "section" ? "Section rewritten." : "Draft rewritten.");
      if (result.editorial_warning) {
        toast.warning("Rewrite saved, but its AI-rewrite lineage needs attention.");
      }
    } catch {
      // API client surfaces the error.
    } finally {
      setRewriting(false);
    }
  }, [body, clientId, piece.id, rewriteInstruction, currentUpdatedAt, loadRevisions, onPieceChanged, editorRef, setBody, setPersistedBody, setCurrentUpdatedAt, setEditing]);

  const duplicate = useCallback(async () => {
    if (derivedActionRef.current) return;
    derivedActionRef.current = "duplicate";
    setDerivedAction("duplicate");
    try {
      const created = await api.post<ContentPiece>(ROUTES.content.duplicate(), { client_id: clientId, id: piece.id });
      onArtifactCreated(created);
      toast.success("Draft duplicated. It is available in History.");
    } catch {
      // API client surfaces the error.
    } finally {
      derivedActionRef.current = null;
      setDerivedAction(null);
    }
  }, [clientId, piece.id, onArtifactCreated]);

  const adapt = useCallback(async () => {
    if (derivedActionRef.current) return;
    derivedActionRef.current = "adapt";
    setDerivedAction("adapt");
    try {
      const created = await api.post<ContentPiece>(ROUTES.content.adapt(), {
        client_id: clientId,
        id: piece.id,
        target_type: adaptType,
      });
      onArtifactCreated(created);
      toast.success(`Adapted into one ${adaptType} draft.`);
    } catch {
      // API client surfaces the error.
    } finally {
      derivedActionRef.current = null;
      setDerivedAction(null);
    }
  }, [clientId, piece.id, adaptType, onArtifactCreated]);

  const exportText = useCallback(() => {
    const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${piece.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "content"}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [body, piece.title]);

  const handleStatusChange = useCallback(
    async (newStatus: ContentStatus) => {
      setLifecycleNotice(null);
      if (dirty) {
        toast.error("Save or discard the current edit before changing status.");
        setLifecycleNotice({ kind: "error", message: "Save or discard the current edit before changing status." });
        return;
      }
      try {
        const updated = await updateStatus({
          client_id: clientId,
          id: piece.id,
          status: newStatus,
          expected_updated_at: currentUpdatedAt || undefined,
        });
        if (updated.status !== newStatus) {
          throw new Error(`The server returned “${updated.status}” instead of “${newStatus}”.`);
        }
        setPersistedBody(updated.body ?? persistedBody);
        setCurrentUpdatedAt(updated.updated_at ?? "");
        onStatusChanged(piece.id, newStatus);
        onPieceChanged(updated);
        setLifecycleNotice({
          kind: "success",
          message: newStatus === "archived"
            ? "Content archived. It remains recoverable in the Library."
            : newStatus === "approved"
              ? "Content approved."
              : "Content restored to draft.",
        });
      } catch (error) {
        // The API client handles request failures globally; the persistent
        // inline message prevents a lifecycle action from ever appearing inert.
        setLifecycleNotice({
          kind: "error",
          message: error instanceof Error
            ? `Status did not change: ${error.message}`
            : "Status did not change. Reload the content and try again.",
        });
      }
    },
    [dirty, updateStatus, clientId, piece.id, currentUpdatedAt, persistedBody, onStatusChanged, onPieceChanged, setPersistedBody, setCurrentUpdatedAt]
  );

  return {
    copied,
    rewriteInstruction,
    setRewriteInstruction,
    rewriting,
    derivedAction,
    isUpdating,
    isSavingDraft,
    handleCopy,
    saveDraft,
    rewrite,
    duplicate,
    adapt,
    exportText,
    handleStatusChange,
    lifecycleNotice,
  };
}
