/**
 * POST /api/tools/ad-copy — Ad copy generator.
 * Product/offer + platform → 5 ad variants. Google Search uses headline ≤30 /
 * description ≤90; Meta uses a primary text + headline.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { toolsLimiter, tooManyRequests } from "@/lib/rate-limit";
import { authorizeTool, companyContext, toolJson, logToolRun } from "@/lib/tools/ai";

export const maxDuration = 60;

const PLATFORMS = ["google", "meta"] as const;
const schema = z.object({
  clientId: z.string().uuid(),
  offer: z.string().min(3).max(2000),
  platform: z.enum(PLATFORMS).optional().default("meta"),
});

interface Ad { headline: string; body: string; angle: string }

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Describe the product or offer." }, { status: 422 });

  const denied = authorizeTool(user, parsed.data.clientId);
  if (denied) return denied;
  const rl = toolsLimiter.check(`tools:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  const ctx = await companyContext(parsed.data.clientId);
  const isGoogle = parsed.data.platform === "google";
  const spec = isGoogle
    ? `Google Search ads: "headline" ≤30 characters, "body" is the description ≤90 characters. Count carefully.`
    : `Facebook/Instagram ads: "headline" ≤40 characters, "body" is the primary text (1-3 punchy sentences with a hook and CTA).`;

  const system = `You are a direct-response ad copywriter${ctx.companyName ? ` for ${ctx.companyName}` : ""}.${ctx.location ? ` Location: ${ctx.location}.` : ""}
${spec}
Return JSON: {"variants":[{"headline":"","body":"","angle":"the appeal used"}]} — exactly 5, each a different angle (benefit, urgency/scarcity, social proof, problem-agitate, curiosity).
Rules: respect the character limits strictly, one clear CTA, no fabricated claims/figures (use a [placeholder] if needed).`;

  const result = await toolJson<{ variants: Ad[] }>(system, `Offer: ${parsed.data.offer}`, 1500);
  if (!result.data?.variants?.length) return NextResponse.json({ error: result.error ?? "Couldn't write ad copy." }, { status: 502 });

  const payload = {
    platform: parsed.data.platform,
    variants: result.data.variants.filter((v) => v.headline?.trim() || v.body?.trim()).slice(0, 5).map((v) => ({
      headline: String(v.headline ?? "").slice(0, 120),
      body: String(v.body ?? "").slice(0, 400),
      angle: String(v.angle ?? "").slice(0, 60),
    })),
  };
  logToolRun("ad-copy", parsed.data.clientId, user.id, parsed.data.offer.slice(0, 80), result.tokens, payload);
  return NextResponse.json(payload);
});
