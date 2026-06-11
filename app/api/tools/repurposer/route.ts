/**
 * POST /api/tools/repurposer — one blog post → LinkedIn post, Facebook post,
 * Instagram caption, and 3 short-video scripts. The highest-leverage tool for
 * a marketing VA: one piece of pillar content becomes a week of social.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { toolsLimiter, tooManyRequests } from "@/lib/rate-limit";
import { authorizeTool, companyContext, toolJson, logToolRun } from "@/lib/tools/ai";
import { renderPrompt } from "@/lib/prompts/server";

export const maxDuration = 60;

const schema = z.object({
  clientId: z.string().uuid(),
  content: z.string().min(100).max(30000),
});

interface Repurposed {
  linkedin: string;
  facebook: string;
  instagram: string;
  scripts: { title: string; hook: string; script: string }[];
}

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Paste the blog post (at least a few paragraphs)." }, { status: 422 });

  const denied = authorizeTool(user, parsed.data.clientId);
  if (denied) return denied;

  const rl = toolsLimiter.check(`tools:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  const ctx = await companyContext(parsed.data.clientId);
  const voice = ctx.brandVoice ? `\nBrand voice to match everywhere: ${ctx.brandVoice}` : "";

  const system = await renderPrompt("tools.repurposer", {
    for_company: ctx.companyName ? ` for ${ctx.companyName}` : "",
    voice,
  });

  // 3 posts + 3 scripts need headroom — a tight cap truncates the JSON.
  const result = await toolJson<Repurposed>(system, parsed.data.content.slice(0, 24000), 5000);
  if (!result.data?.linkedin) {
    return NextResponse.json({ error: result.error ?? "Couldn't repurpose the post. Try again." }, { status: 502 });
  }

  const r = result.data;
  const payload = {
    linkedin: String(r.linkedin).slice(0, 5000),
    facebook: String(r.facebook).slice(0, 5000),
    instagram: String(r.instagram).slice(0, 4000),
    scripts: (r.scripts ?? []).slice(0, 3).map((s) => ({
      title: String(s.title ?? "").slice(0, 120),
      hook: String(s.hook ?? "").slice(0, 200),
      script: String(s.script ?? "").slice(0, 2500),
    })),
  };
  logToolRun("repurposer", parsed.data.clientId, user.id, parsed.data.content.split("\n").find(Boolean)?.slice(0, 80) ?? "blog post", result.tokens, payload);
  return NextResponse.json(payload);
});
