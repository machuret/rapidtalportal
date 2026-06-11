/**
 * POST /api/sops/generate — produce a full, structured SOP from a topic/title.
 * Strong model, JSON output: { intro, prerequisites[], steps[{title,detail,tip}] }.
 * The author reviews and edits before saving. Admin-only.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { sopAiLimiter, tooManyRequests } from "@/lib/rate-limit";
import { authorizeSopScope, clientContext, llmJson, GENERATE_MODEL } from "@/lib/sops/ai";
import { renderPrompt } from "@/lib/prompts/server";

export const maxDuration = 60;

const schema = z.object({
  topic: z.string().min(3).max(300),
  title: z.string().max(300).optional(),
  category: z.string().max(100).optional(),
  audience: z.enum(["new", "experienced", "any"]).optional().default("any"),
  depth: z.enum(["quick", "standard", "thorough"]).optional().default("standard"),
  clientId: z.string().uuid().nullable().optional(),
  // "Improve with AI" on an existing SOP: the current content + what to change.
  existing: z.string().max(100000).optional(),
  instruction: z.string().max(1000).optional(),
});

interface GenSop {
  title?: string;
  intro: string;
  prerequisites: string[];
  steps: { title: string; detail: string; tip?: string }[];
}

const DEPTH_HINT: Record<string, string> = {
  quick: "Keep it tight: 4-6 steps, only the essentials.",
  standard: "Aim for 6-10 well-scoped steps.",
  thorough: "Be comprehensive: 10-16 steps covering edge cases and checks.",
};
const AUDIENCE_HINT: Record<string, string> = {
  new: "Assume the reader is new — explain terms and don't skip basics.",
  experienced: "Assume an experienced operator — be concise, skip the obvious.",
  any: "Write for a capable VA who may be new to this specific task.",
};

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "A topic (3+ characters) is required." }, { status: 422 });

  const clientId = parsed.data.clientId ?? null;
  const denied = authorizeSopScope(user, clientId);
  if (denied) return denied;

  const rl = sopAiLimiter.check(`sop-ai:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  const ctx = await clientContext(clientId);
  const improving = !!parsed.data.existing?.trim();
  const system = await renderPrompt("sops.generate", {
    mode: improving ? "improving an existing" : "creating a",
    depth_hint: DEPTH_HINT[parsed.data.depth],
    audience_hint: AUDIENCE_HINT[parsed.data.audience],
    client_context: ctx,
  });

  const userMsg = [
    `Topic: ${parsed.data.topic}`,
    parsed.data.title ? `Preferred title/angle: ${parsed.data.title}` : "",
    parsed.data.category ? `Category: ${parsed.data.category}` : "",
    improving ? `\nImprove this EXISTING SOP — keep what's correct, fix structure, clarity, gaps and ordering:\n"""\n${parsed.data.existing!.slice(0, 40000)}\n"""` : "",
    improving && parsed.data.instruction?.trim() ? `\nFocus of the improvement: ${parsed.data.instruction.trim()}` : "",
  ].filter(Boolean).join("\n");

  const result = await llmJson<GenSop>(GENERATE_MODEL, system, userMsg, 4000);
  if (!result.data?.steps?.length) {
    return NextResponse.json({ error: result.error ?? "Couldn't generate the SOP. Try again or adjust the topic." }, { status: 502 });
  }

  // Sanitize to our shape + caps.
  const steps = result.data.steps
    .filter((s) => s.title?.trim())
    .slice(0, 40)
    .map((s) => ({
      title: String(s.title).slice(0, 300),
      detail: String(s.detail ?? "").slice(0, 5000),
      ...(s.tip?.trim() ? { tip: String(s.tip).slice(0, 1000) } : {}),
    }));
  const prerequisites = Array.isArray(result.data.prerequisites)
    ? result.data.prerequisites.filter((p) => typeof p === "string" && p.trim()).slice(0, 30).map((p) => p.slice(0, 500))
    : [];

  return NextResponse.json({
    title: (result.data.title || parsed.data.title || parsed.data.topic).slice(0, 300),
    intro: String(result.data.intro ?? "").slice(0, 5000),
    prerequisites,
    steps,
    tokensUsed: result.tokens,
  });
}, { roles: ["client_admin", "super_admin"] });
