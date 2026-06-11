/**
 * POST /api/tools/content-auditor — scored audit of existing page copy.
 * Overall score + sub-scores (content depth, keyword usage, readability,
 * structure), prioritized issues, internal-link suggestions, quick wins.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { toolsLimiter, tooManyRequests } from "@/lib/rate-limit";
import { authorizeTool, toolJson, logToolRun } from "@/lib/tools/ai";

export const maxDuration = 60;

const schema = z.object({
  clientId: z.string().uuid(),
  content: z.string().min(100).max(30000),
  keyword: z.string().max(200).optional(),
});

interface Audit {
  overall: number;
  subscores: { depth: number; keyword: number; readability: number; structure: number };
  issues: { severity: "high" | "medium" | "low"; issue: string; fix: string }[];
  internalLinks: string[];
  quickWins: string[];
}

const clamp = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Paste at least a few paragraphs of page copy." }, { status: 422 });

  const denied = authorizeTool(user, parsed.data.clientId);
  if (denied) return denied;

  const rl = toolsLimiter.check(`tools:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  const system = `You are a rigorous SEO content auditor. Audit the page copy${parsed.data.keyword ? ` against the target keyword "${parsed.data.keyword}"` : ""} and score it honestly — most real pages score 40-75; reserve 85+ for genuinely excellent copy.

Return JSON exactly:
{"overall":0-100,"subscores":{"depth":0-100,"keyword":0-100,"readability":0-100,"structure":0-100},"issues":[{"severity":"high|medium|low","issue":"what's wrong, specifically","fix":"exactly what to do about it"}],"internalLinks":["anchor-text → suggested target page topics this copy should link to"],"quickWins":["small changes with outsized impact"]}

Scoring lenses: depth = thin content vs comprehensive coverage; keyword = natural usage, placement in headings/intro, related terms; readability = sentence length, jargon, scannability; structure = heading hierarchy, paragraphs, lists, intro/conclusion. 3-8 issues ordered by severity, 2-5 internal link suggestions, 2-4 quick wins. Be specific to THIS copy — quote short phrases where useful.`;

  const result = await toolJson<Audit>(system, parsed.data.content.slice(0, 24000), 2500);
  if (!result.data?.subscores) {
    return NextResponse.json({ error: result.error ?? "Couldn't audit the copy. Try again." }, { status: 502 });
  }

  const a = result.data;
  const payload = {
    overall: clamp(a.overall),
    subscores: {
      depth: clamp(a.subscores.depth),
      keyword: clamp(a.subscores.keyword),
      readability: clamp(a.subscores.readability),
      structure: clamp(a.subscores.structure),
    },
    issues: (a.issues ?? []).slice(0, 10).map((i) => ({
      severity: (["high", "medium", "low"].includes(i.severity) ? i.severity : "medium") as Audit["issues"][number]["severity"],
      issue: String(i.issue ?? "").slice(0, 400),
      fix: String(i.fix ?? "").slice(0, 400),
    })),
    internalLinks: (a.internalLinks ?? []).slice(0, 6).map((l) => String(l).slice(0, 200)),
    quickWins: (a.quickWins ?? []).slice(0, 6).map((w) => String(w).slice(0, 300)),
  };
  logToolRun("content-auditor", parsed.data.clientId, user.id, parsed.data.keyword || "page copy", result.tokens, payload);
  return NextResponse.json(payload);
});
