/**
 * POST /api/tools/newsletter — Email newsletter writer.
 * Topic / this week's updates → subject line, preview text, and a ready body.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withTool } from "@/lib/tools/handler";
import { companyContext, toolJson, logToolRun, clampStr } from "@/lib/tools/ai";
import { renderPrompt } from "@/lib/prompts/server";

export const maxDuration = 60;

const schema = z.object({
  clientId: z.string().uuid(),
  topic: z.string().min(3).max(4000),
  tone: z.string().max(50).optional().default("Friendly"),
});

interface Newsletter { subject: string; preview: string; body: string }

export const POST = withTool(
  { slug: "newsletter", schema, invalid: "Describe what the newsletter is about." },
  async ({ data, user }) => {
    const ctx = await companyContext(data.clientId);
    const bits = [ctx.companyName && `From: ${ctx.companyName}`, ctx.services && `Offers: ${ctx.services}`, ctx.brandVoice && `Brand voice: ${ctx.brandVoice}`].filter(Boolean).join("\n");

    const system = await renderPrompt("tools.newsletter", {
      for_company: ctx.companyName ? ` for ${ctx.companyName}` : "",
      tone: data.tone,
      business_context: bits,
    });

    const result = await toolJson<Newsletter>(system, data.topic, 2500, undefined, data.clientId);
    if (!result.data?.body) return NextResponse.json({ error: result.error ?? "Couldn't write the newsletter." }, { status: 502 });

    const payload = {
      subject: clampStr(result.data.subject, 120),
      preview: clampStr(result.data.preview, 200),
      body: clampStr(result.data.body, 6000),
    };
    logToolRun("newsletter", data.clientId, user.id, data.topic.slice(0, 80), result.tokens, payload, result.brainContextSnapshotId);
    return NextResponse.json({ ...payload, _brainContextSnapshotId: result.brainContextSnapshotId ?? null });
  },
);
