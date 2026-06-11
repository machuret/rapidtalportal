/**
 * POST /api/tools/hashtags — Hashtag researcher.
 * Topic/niche (+ platform) → hashtags grouped by reach tier so the mix isn't
 * all giant tags nothing ranks for.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withTool } from "@/lib/tools/handler";
import { companyContext, toolJson, logToolRun, clampStr, TOOL_MODEL_MINI } from "@/lib/tools/ai";
import { renderPrompt } from "@/lib/prompts/server";

export const maxDuration = 60;

const schema = z.object({
  clientId: z.string().uuid(),
  topic: z.string().min(2).max(500),
  platform: z.string().max(40).optional().default("Instagram"),
});

interface Groups { broad: string[]; niche: string[]; local: string[]; branded: string[]; note: string }

export const POST = withTool(
  { slug: "hashtags", schema, invalid: "Enter a topic or niche." },
  async ({ data, user }) => {
    const ctx = await companyContext(data.clientId);
    const locality = ctx.location ? `Use this location for local tags: ${ctx.location}.` : "";

    const system = await renderPrompt("tools.hashtags", {
      platform: data.platform,
      business_note: ctx.companyName ? `Business: ${ctx.companyName}.` : "",
      locality,
    });

    const result = await toolJson<Groups>(system, `Topic / niche: ${data.topic}`, 1200, TOOL_MODEL_MINI);
    if (!result.data) return NextResponse.json({ error: result.error ?? "Couldn't research hashtags." }, { status: 502 });

    const clean = (arr: unknown, n: number) => (Array.isArray(arr) ? arr : []).filter((t) => typeof t === "string" && t.trim()).slice(0, n).map((t) => String(t).trim());
    const payload = {
      broad: clean(result.data.broad, 12),
      niche: clean(result.data.niche, 14),
      local: clean(result.data.local, 10),
      branded: clean(result.data.branded, 6),
      note: clampStr(result.data.note, 300),
    };
    logToolRun("hashtags", data.clientId, user.id, data.topic.slice(0, 80), result.tokens, payload);
    return NextResponse.json(payload);
  },
);
