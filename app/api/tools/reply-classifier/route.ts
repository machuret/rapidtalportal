/**
 * POST /api/tools/reply-classifier — Reply Classifier + Response Drafter.
 * Paste a prospect's reply → it classifies the intent (interested / objection /
 * not now / other) and drafts an on-brand response to keep the thread moving.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withTool } from "@/lib/tools/handler";
import { companyContext, toolJson, logToolRun, stripDashes, TOOL_MODEL_MINI } from "@/lib/tools/ai";
import { renderPrompt, getPromptTemplate } from "@/lib/prompts/server";

export const maxDuration = 60;

const schema = z.object({
  clientId: z.string().uuid(),
  reply: z.string().min(2).max(4000),
  context: z.string().max(500).optional(),
});

type Classification = "interested" | "objection" | "not_now" | "other";
interface Classified { classification: Classification; label: string; reasoning: string; draft: string }

const LABELS: Record<Classification, string> = {
  interested: "Interested",
  objection: "Objection",
  not_now: "Not now",
  other: "Other",
};

export const POST = withTool(
  { slug: "reply-classifier", schema, invalid: "Paste the prospect's reply." },
  async ({ data, user }) => {
    const [ctx, outreachStyle] = await Promise.all([
      companyContext(data.clientId),
      getPromptTemplate("style.outreach"),
    ]);
    const voice = ctx.brandVoice ? `\nMatch this brand voice: ${ctx.brandVoice}` : "";

    const system = await renderPrompt("tools.reply-classifier", {
      outreach_style: outreachStyle,
      voice,
    });

    const result = await toolJson<Omit<Classified, "label">>(
      system,
      `Prospect reply:\n${data.reply}${data.context ? `\n\nContext: ${data.context}` : ""}`,
      900,
      TOOL_MODEL_MINI,
    );
    if (!result.data?.draft) {
      return NextResponse.json({ error: result.error ?? "Couldn't classify the reply. Try again." }, { status: 502 });
    }

    const cls = (["interested", "objection", "not_now", "other"] as Classification[]).includes(result.data.classification)
      ? result.data.classification : "other";
    const payload = {
      classification: cls,
      label: LABELS[cls],
      reasoning: stripDashes(String(result.data.reasoning ?? "")).slice(0, 300),
      draft: stripDashes(String(result.data.draft ?? "")).slice(0, 2000),
    };
    logToolRun("reply-classifier", data.clientId, user.id, data.reply.slice(0, 80), result.tokens, payload, result.brainContextSnapshotId);
    return NextResponse.json({ ...payload, _brainContextSnapshotId: result.brainContextSnapshotId ?? null });
  },
);
