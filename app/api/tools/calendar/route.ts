/**
 * POST /api/tools/calendar — 30-day social content calendar.
 * Niche/focus + tone → a month of post ideas, each with a format and a hook.
 * Grounded in the client's Company DNA so ideas fit their actual business.
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
  focus: z.string().max(500).optional(),
  tone: z.string().max(50).optional().default("Friendly"),
  platform: z.string().max(50).optional(),
});

interface Day { day: number; format: string; idea: string; hook: string }

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const denied = authorizeTool(user, parsed.data.clientId);
  if (denied) return denied;

  const rl = toolsLimiter.check(`tools:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  const ctx = await companyContext(parsed.data.clientId);
  if (!parsed.data.focus?.trim() && !ctx.services) {
    return NextResponse.json({ error: "Describe the niche/focus (or fill the client's Company DNA services)." }, { status: 422 });
  }

  const contextBits = [
    ctx.companyName && `Company: ${ctx.companyName}`,
    ctx.location && `Location: ${ctx.location}`,
    ctx.services && `Services: ${ctx.services}`,
    ctx.brandVoice && `Brand voice: ${ctx.brandVoice}`,
  ].filter(Boolean).join("\n");

  const system = await renderPrompt("tools.calendar", {
    client_context: contextBits ? `\nThe client:\n${contextBits}\n` : "",
    platform_note: parsed.data.platform ? `Primary platform: ${parsed.data.platform}.` : "Mix formats across platforms.",
    tone: parsed.data.tone,
  });

  // 30 structured days need headroom — a tight cap truncates the JSON mid-array.
  const result = await toolJson<{ days: Day[] }>(
    system,
    `Niche / monthly focus: ${parsed.data.focus?.trim() || ctx.services}`,
    6000,
  );
  if (!result.data?.days?.length) {
    return NextResponse.json({ error: result.error ?? "Couldn't build the calendar. Try again." }, { status: 502 });
  }

  const days = result.data.days
    .filter((d) => d.idea?.trim())
    .slice(0, 31)
    .map((d, i) => ({
      day: Number(d.day) || i + 1,
      format: String(d.format ?? "Post").slice(0, 20),
      idea: String(d.idea).slice(0, 300),
      hook: String(d.hook ?? "").slice(0, 160),
    }));

  logToolRun("calendar", parsed.data.clientId, user.id, parsed.data.focus || "content calendar", result.tokens, { days });
  return NextResponse.json({ days });
});
