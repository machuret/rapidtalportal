/**
 * POST /api/tools/carousel — Carousel-slide breakdown.
 * Topic or pasted content → slide-by-slide breakdown (hook → value → CTA)
 * plus a caption.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { toolsLimiter, tooManyRequests } from "@/lib/rate-limit";
import { authorizeTool, companyContext, toolJson, logToolRun } from "@/lib/tools/ai";

export const maxDuration = 60;

const schema = z.object({
  clientId: z.string().uuid(),
  topic: z.string().min(3).max(20000),
});

interface Carousel { slides: { heading: string; body: string }[]; caption: string }

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter a topic or paste content." }, { status: 422 });

  const denied = authorizeTool(user, parsed.data.clientId);
  if (denied) return denied;
  const rl = toolsLimiter.check(`tools:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  const ctx = await companyContext(parsed.data.clientId);
  const voice = ctx.brandVoice ? `\nBrand voice: ${ctx.brandVoice}` : "";

  const system = `You design Instagram/LinkedIn carousels${ctx.companyName ? ` for ${ctx.companyName}` : ""}.${voice}
Return JSON: {"slides":[{"heading":"slide title (short, big-text)","body":"1-2 lines of supporting copy for the slide"}],"caption":"the post caption with a hook, value, CTA and 5-8 hashtags"}
Rules: 6-9 slides. Slide 1 is a scroll-stopping hook, the last slide is a clear CTA, the middle slides deliver one idea each. Keep slide text short enough to fit on a graphic. No markdown symbols.`;

  const result = await toolJson<Carousel>(system, parsed.data.topic.slice(0, 16000), 2500);
  if (!result.data?.slides?.length) return NextResponse.json({ error: result.error ?? "Couldn't build the carousel." }, { status: 502 });

  logToolRun("carousel", parsed.data.clientId, user.id, parsed.data.topic.slice(0, 80), result.tokens);
  return NextResponse.json({
    slides: result.data.slides.filter((s) => s.heading?.trim() || s.body?.trim()).slice(0, 12).map((s) => ({
      heading: String(s.heading ?? "").slice(0, 200),
      body: String(s.body ?? "").slice(0, 400),
    })),
    caption: String(result.data.caption ?? "").slice(0, 2200),
  });
});
