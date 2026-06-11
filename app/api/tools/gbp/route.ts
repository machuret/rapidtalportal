/**
 * POST /api/tools/gbp — Google Business Profile Post Writer.
 * Topic (+ optional service) → 3 local-SEO GBP posts, grounded in the client's
 * company name, location and services from Company DNA.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withTool } from "@/lib/tools/handler";
import { companyContext, toolJson, logToolRun, clampStr, clampArr } from "@/lib/tools/ai";
import { renderPrompt } from "@/lib/prompts/server";

export const maxDuration = 60;

const schema = z.object({
  clientId: z.string().uuid(),
  topic: z.string().min(3).max(500),
  service: z.string().max(200).optional(),
});

interface Post { body: string; cta: string; localAngle: string }

export const POST = withTool(
  { slug: "gbp", schema, invalid: "Enter a topic for the post." },
  async ({ data, user }) => {
    const ctx = await companyContext(data.clientId);
    const company = ctx.companyName ?? "the business";
    const contextBits = [
      ctx.location && `Location (use for local SEO): ${ctx.location}`,
      ctx.services && `Services: ${ctx.services}`,
      data.service && `Focus service for these posts: ${data.service}`,
      ctx.brandVoice && `Brand voice to match: ${ctx.brandVoice}`,
    ].filter(Boolean).join("\n");

    const system = await renderPrompt("tools.gbp", { company, context: contextBits });

    const result = await toolJson<{ posts: Post[] }>(system, `Topic: ${data.topic}`, 1800);
    if (!result.data?.posts?.length) {
      return NextResponse.json({ error: result.error ?? "Couldn't generate posts. Try again." }, { status: 502 });
    }

    const posts = clampArr(result.data.posts, 3)
      .filter((p) => p.body?.trim())
      .map((p) => ({ body: clampStr(p.body, 1600), cta: clampStr(p.cta, 40), localAngle: clampStr(p.localAngle, 120) }));

    const payload = { posts, hasContext: !!(ctx.location || ctx.services) };
    logToolRun("gbp", data.clientId, user.id, data.topic, result.tokens, payload);
    return NextResponse.json(payload);
  },
);
