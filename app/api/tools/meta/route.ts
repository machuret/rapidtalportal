/**
 * POST /api/tools/meta — Meta Title & Description Writer.
 * Page content (+ optional keyword) → 5 CTR-optimised title/description
 * variants under the character limits.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { toolsLimiter, tooManyRequests } from "@/lib/rate-limit";
import { authorizeTool, toolJson, logToolRun } from "@/lib/tools/ai";
import { renderPrompt } from "@/lib/prompts/server";

export const maxDuration = 60;

const schema = z.object({
  clientId: z.string().uuid(),
  content: z.string().min(20).max(20000),
  keyword: z.string().max(200).optional(),
  // "Fix length": rewrite ONE over-limit variant to fit, preserving the angle.
  shorten: z.object({ title: z.string().max(200), description: z.string().max(400) }).optional(),
});

interface Variant { title: string; description: string; angle: string }

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Paste at least a paragraph of page content." }, { status: 422 });

  const denied = authorizeTool(user, parsed.data.clientId);
  if (denied) return denied;

  const rl = toolsLimiter.check(`tools:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  // Shorten mode: tighten a single variant under the limits, keep its angle.
  if (parsed.data.shorten) {
    const sys = await renderPrompt("tools.meta-shorten");
    const r = await toolJson<{ variants: Variant[] }>(sys,
      `Title: ${parsed.data.shorten.title}
Description: ${parsed.data.shorten.description}
Page context: ${parsed.data.content.slice(0, 2000)}`, 400);
    const v = r.data?.variants?.[0];
    if (!v?.title) return NextResponse.json({ error: r.error ?? "Couldn't shorten it. Edit manually." }, { status: 502 });
    return NextResponse.json({ variants: [{ title: String(v.title).slice(0, 120), description: String(v.description ?? "").slice(0, 320), angle: String(v.angle ?? "shortened").slice(0, 80) }] });
  }

  const system = await renderPrompt("tools.meta", {
    keyword_note: parsed.data.keyword ? ` (target keyword: "${parsed.data.keyword}")` : "",
  });

  const result = await toolJson<{ variants: Variant[] }>(system, parsed.data.content.slice(0, 16000), 1500);
  if (!result.data?.variants?.length) {
    return NextResponse.json({ error: result.error ?? "Couldn't generate variants. Try again." }, { status: 502 });
  }

  const variants = result.data.variants
    .filter((v) => v.title?.trim())
    .slice(0, 5)
    .map((v) => ({ title: String(v.title).slice(0, 120), description: String(v.description ?? "").slice(0, 320), angle: String(v.angle ?? "").slice(0, 80) }));

  logToolRun("meta", parsed.data.clientId, user.id, parsed.data.keyword || "page content", result.tokens, { variants });
  return NextResponse.json({ variants });
});
