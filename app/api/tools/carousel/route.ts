/**
 * POST /api/tools/carousel — Carousel-slide breakdown.
 * Topic or pasted content → slide-by-slide breakdown (hook → value → CTA)
 * plus a caption.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withTool } from "@/lib/tools/handler";
import { companyContext, toolJson, logToolRun, clampStr, clampArr } from "@/lib/tools/ai";
import { renderPrompt } from "@/lib/prompts/server";

export const maxDuration = 60;

const schema = z.object({
  clientId: z.string().uuid(),
  topic: z.string().min(3).max(20000),
});

interface Carousel { slides: { heading: string; body: string }[]; caption: string }

export const POST = withTool(
  { slug: "carousel", schema, invalid: "Enter a topic or paste content." },
  async ({ data, user }) => {
    const ctx = await companyContext(data.clientId);
    const voice = ctx.brandVoice ? `\nBrand voice: ${ctx.brandVoice}` : "";

    const system = await renderPrompt("tools.carousel", {
      for_company: ctx.companyName ? ` for ${ctx.companyName}` : "",
      voice,
    });

    const result = await toolJson<Carousel>(system, data.topic, 2500, undefined, data.clientId);
    if (!result.data?.slides?.length) return NextResponse.json({ error: result.error ?? "Couldn't build the carousel." }, { status: 502 });

    const payload = {
      slides: clampArr(result.data.slides, 12).filter((s) => s.heading?.trim() || s.body?.trim()).map((s) => ({
        heading: clampStr(s.heading, 200),
        body: clampStr(s.body, 400),
      })),
      caption: clampStr(result.data.caption, 2200),
    };
    logToolRun("carousel", data.clientId, user.id, data.topic.slice(0, 80), result.tokens, payload, result.brainContextSnapshotId);
    return NextResponse.json(payload);
  },
);
