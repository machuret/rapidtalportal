/**
 * POST /api/tools/reply-classifier — Reply Classifier + Response Drafter.
 * Paste a prospect's reply → it classifies the intent (interested / objection /
 * not now / other) and drafts an on-brand response to keep the thread moving.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { toolsLimiter, tooManyRequests } from "@/lib/rate-limit";
import { authorizeTool, companyContext, toolJson, logToolRun, stripDashes, TOOL_MODEL_MINI } from "@/lib/tools/ai";
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

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Paste the prospect's reply." }, { status: 422 });

  const denied = authorizeTool(user, parsed.data.clientId);
  if (denied) return denied;

  const rl = toolsLimiter.check(`tools:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  const ctx = await companyContext(parsed.data.clientId);
  const voice = ctx.brandVoice ? `\nMatch this brand voice: ${ctx.brandVoice}` : "";

  const system = await renderPrompt("tools.reply-classifier", {
    outreach_style: await getPromptTemplate("style.outreach"),
    voice,
  });

  const result = await toolJson<Omit<Classified, "label">>(
    system,
    `Prospect reply:\n${parsed.data.reply}${parsed.data.context ? `\n\nContext: ${parsed.data.context}` : ""}`,
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
  logToolRun("reply-classifier", parsed.data.clientId, user.id, parsed.data.reply.slice(0, 80), result.tokens, payload);
  return NextResponse.json(payload);
});
