/**
 * POST /api/tools/ad-copy — Ad copy generator.
 * Product/offer + platform → 5 ad variants. Google Search uses headline ≤30 /
 * description ≤90; Meta uses a primary text + headline.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withTool } from "@/lib/tools/handler";
import { companyContext, toolJson, logToolRun, clampStr, clampArr } from "@/lib/tools/ai";
import { renderPrompt } from "@/lib/prompts/server";

export const maxDuration = 60;

const PLATFORMS = ["google", "meta"] as const;
const schema = z.object({
  clientId: z.string().uuid(),
  offer: z.string().min(3).max(2000),
  platform: z.enum(PLATFORMS).optional().default("meta"),
});

interface Ad { headline: string; body: string; angle: string }

export const POST = withTool(
  { slug: "ad-copy", schema, invalid: "Describe the product or offer." },
  async ({ data, user }) => {
    const ctx = await companyContext(data.clientId);
    const isGoogle = data.platform === "google";
    const spec = isGoogle
      ? `Google Search ads: "headline" ≤30 characters, "body" is the description ≤90 characters. Count carefully.`
      : `Facebook/Instagram ads: "headline" ≤40 characters, "body" is the primary text (1-3 punchy sentences with a hook and CTA).`;

    const system = await renderPrompt("tools.ad-copy", {
      for_company: ctx.companyName ? ` for ${ctx.companyName}` : "",
      location_note: ctx.location ? ` Location: ${ctx.location}.` : "",
      platform_spec: spec,
    });

    const result = await toolJson<{ variants: Ad[] }>(system, `Offer: ${data.offer}`, 1500, undefined, data.clientId);
    if (!result.data?.variants?.length) return NextResponse.json({ error: result.error ?? "Couldn't write ad copy." }, { status: 502 });

    const payload = {
      platform: data.platform,
      variants: clampArr(result.data.variants, 5).filter((v) => v.headline?.trim() || v.body?.trim()).map((v) => ({
        headline: clampStr(v.headline, 120),
        body: clampStr(v.body, 400),
        angle: clampStr(v.angle, 60),
      })),
    };
    logToolRun("ad-copy", data.clientId, user.id, data.offer.slice(0, 80), result.tokens, payload);
    return NextResponse.json(payload);
  },
);
