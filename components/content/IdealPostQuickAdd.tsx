"use client";

import { useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const CHANNELS = ["linkedin", "facebook", "instagram", "x", "email", "newsletter", "blog"] as const;

type GoldenRow = { id: string; updated_at: string };

/**
 * One-click "ideal post" teacher. Pasting a post you love creates a golden
 * example AND approves it in one step — it immediately counts as a style
 * source and toward the 5-per-channel evaluation baseline. The full editor
 * below stays for curation; this is the fast path.
 */
export function IdealPostQuickAdd({
  clientId,
  approvedByChannel,
  onAdded,
}: {
  clientId: string;
  /** channel → count of approved, permissioned examples (for the /5 meter). */
  approvedByChannel: Record<string, number>;
  onAdded?: () => void;
}) {
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>("linkedin");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  // The page no longer re-renders on add (that remount wiped unsaved work in
  // the tools below), so the /5 meter tracks this session's additions itself.
  const [addedByChannel, setAddedByChannel] = useState<Record<string, number>>({});

  const approved = (approvedByChannel[channel] ?? 0) + (addedByChannel[channel] ?? 0);

  async function submit() {
    if (busy) return;
    if (body.trim().length < 40) {
      toast.error("Paste the full post — at least 40 characters.");
      return;
    }
    setBusy(true);
    try {
      const created = await api.post<GoldenRow>(ROUTES.content.goldens(), {
        client_id: clientId,
        channel,
        title: title.trim() || `Ideal ${channel} post`,
        body: body.trim(),
        content_type: "post",
        represents_brand_strongly: true,
        evaluation_permission: true,
      }, { showErrorToast: false });
      // One click = one decision: an admin pasting an ideal post IS approving it.
      await api.patch(ROUTES.content.goldens(), {
        client_id: clientId,
        id: created.id,
        status: "approved",
        evaluation_permission: true,
        expected_updated_at: created.updated_at,
      }, { showErrorToast: false });
      setTitle("");
      setBody("");
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 3000);
      setAddedByChannel((current) => ({ ...current, [channel]: (current[channel] ?? 0) + 1 }));
      toast.success(`Added as an approved ideal ${channel} post. The engine learns from it immediately.`);
      onAdded?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The example could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-zinc-900 to-zinc-950 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-300">
            <Sparkles className="h-3.5 w-3.5" /> Teach your voice
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">Add an ideal post</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Paste a post you love — yours or one you wish you&apos;d written. It becomes an
            <strong> approved golden example</strong>: the engine learns your voice from it right away,
            and it counts toward the 5-per-channel evaluation baseline.
          </p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${approved >= 5 ? "border-emerald-500/30 text-emerald-300" : "border-amber-500/30 text-amber-300"}`}>
          {approved}/5 approved for {channel}
        </span>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[180px_1fr]">
        <select
          value={channel}
          onChange={(event) => setChannel(event.target.value as (typeof CHANNELS)[number])}
          aria-label="Channel"
          className="h-11 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm capitalize text-white"
        >
          {CHANNELS.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={300}
          placeholder={`Title (optional) — e.g. "Our best-performing launch post"`}
          aria-label="Example title"
          className="h-11 bg-zinc-950"
        />
      </div>
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={5}
        maxLength={50000}
        placeholder={`Paste the full ${channel} post here…`}
        aria-label="Ideal post content"
        className="mt-3 bg-zinc-950"
      />
      <div className="mt-3 flex items-center gap-3">
        <Button
          onClick={() => void submit()}
          disabled={busy || body.trim().length < 40}
          className="bg-emerald-600 hover:bg-emerald-500"
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : justAdded ? <Check className="mr-2 h-4 w-4" /> : null}
          {busy ? "Saving…" : justAdded ? "Added!" : "Add as ideal post"}
        </Button>
        <p className="text-xs text-zinc-500">
          Added as approved — no second step. Edit or archive it anytime in the golden library below.
        </p>
      </div>
    </section>
  );
}
