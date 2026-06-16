/**
 * POST /api/tools/meta — Meta Title & Description Writer.
 * Page content (+ optional keyword) → 5 CTR-optimised title/description
 * variants under the character limits.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withTool } from "@/lib/tools/handler";
import { toolJson, logToolRun, clampStr, clampArr } from "@/lib/tools/ai";
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

export const POST = withTool(
  { slug: "meta", schema, invalid: "Paste at least a paragraph of page content." },
  async ({ data, user }) => {
    // Shorten mode: tighten a single variant under the limits, keep its angle.
    if (data.shorten) {
      const sys = await renderPrompt("tools.meta-shorten");
      const r = await toolJson<{ variants: Variant[] }>(sys,
        `Title: ${data.shorten.title}
Description: ${data.shorten.description}
Page context: ${data.content.slice(0, 2000)}`, 400);
      const v = r.data?.variants?.[0];
      if (!v?.title) return NextResponse.json({ error: r.error ?? "Couldn't shorten it. Edit manually." }, { status: 502 });
      return NextResponse.json({ variants: [{ title: clampStr(v.title, 120), description: clampStr(v.description, 320), angle: clampStr(v.angle || "shortened", 80) }] });
    }

    const system = await renderPrompt("tools.meta", {
      keyword_note: data.keyword ? ` (target keyword: "${data.keyword}")` : "",
    });

    const result = await toolJson<{ variants: Variant[] }>(system, data.content, 1500, undefined, data.clientId);
    if (!result.data?.variants?.length) {
      return NextResponse.json({ error: result.error ?? "Couldn't generate variants. Try again." }, { status: 502 });
    }

    const variants = clampArr(result.data.variants, 5)
      .filter((v) => v.title?.trim())
      .map((v) => ({ title: clampStr(v.title, 120), description: clampStr(v.description, 320), angle: clampStr(v.angle, 80) }));

    logToolRun("meta", data.clientId, user.id, data.keyword || "page content", result.tokens, { variants });
    return NextResponse.json({ variants });
  },
);
