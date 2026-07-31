/**
 * POST /api/tools/calendar — 30-day social content calendar.
 * Niche/focus + tone → a month of post ideas, each with a format and a hook.
 * Grounded in the client's Company DNA so ideas fit their actual business.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withTool } from "@/lib/tools/handler";
import { companyContext, toolJson, logToolRun, clampStr, clampArr } from "@/lib/tools/ai";
import { renderPrompt } from "@/lib/prompts/server";

export const maxDuration = 60;

const schema = z.object({
  clientId: z.string().uuid(),
  focus: z.string().max(500).optional(),
  tone: z.string().max(50).optional().default("Friendly"),
  platform: z.string().max(50).optional(),
});

interface Day { day: number; format: string; idea: string; hook: string }

export const POST = withTool(
  { slug: "calendar", schema, invalid: "Invalid input." },
  async ({ data, user }) => {
    const ctx = await companyContext(data.clientId);
    if (!data.focus?.trim() && !ctx.services) {
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
      platform_note: data.platform ? `Primary platform: ${data.platform}.` : "Mix formats across platforms.",
      tone: data.tone,
    });

    // 30 structured days need headroom — a tight cap truncates the JSON mid-array.
    const result = await toolJson<{ days: Day[] }>(
      system,
      `Niche / monthly focus: ${data.focus?.trim() || ctx.services}`,
      6000,
      undefined,
      data.clientId,
    );
    if (!result.data?.days?.length) {
      return NextResponse.json({ error: result.error ?? "Couldn't build the calendar. Try again." }, { status: 502 });
    }

    const days = clampArr(result.data.days, 31)
      .filter((d) => d.idea?.trim())
      .map((d, i) => ({
        day: Number(d.day) || i + 1,
        format: clampStr(d.format || "Post", 20),
        idea: clampStr(d.idea, 300),
        hook: clampStr(d.hook, 160),
      }));

    logToolRun("calendar", data.clientId, user.id, data.focus || "content calendar", result.tokens, { days }, result.brainContextSnapshotId);
    return NextResponse.json({ days });
  },
);
