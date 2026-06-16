/**
 * POST /api/tools/spintax — Spintax Email Builder.
 * A campaign brief → a cold email written to RapidTal house style, with
 * spintax {option a|option b} baked into subject and body so every send is a
 * unique variation (better deliverability, less spam-foldering).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withTool } from "@/lib/tools/handler";
import { companyContext, toolJson, logToolRun, stripDashes } from "@/lib/tools/ai";
import { renderPrompt, getPromptTemplate } from "@/lib/prompts/server";

export const maxDuration = 60;

const schema = z.object({
  clientId: z.string().uuid(),
  brief: z.string().min(20).max(4000),
  audience: z.string().max(500).optional(),
});

interface Spintax { subject: string; preview: string; body: string }

export const POST = withTool(
  { slug: "spintax", schema, invalid: "Describe the offer / campaign (a sentence or two)." },
  async ({ data, user }) => {
    const [ctx, outreachStyle] = await Promise.all([
      companyContext(data.clientId),
      getPromptTemplate("style.outreach"),
    ]);
    const sender = [
      ctx.companyName && `You are writing on behalf of ${ctx.companyName}.`,
      ctx.services && `What they offer: ${ctx.services}`,
      ctx.brandVoice && `Match this brand voice: ${ctx.brandVoice}`,
    ].filter(Boolean).join("\n");

    const system = await renderPrompt("tools.spintax", {
      outreach_style: outreachStyle,
      sender_context: sender,
    });

    const result = await toolJson<Spintax>(system, `Campaign brief: ${data.brief}${data.audience ? `\nTarget audience: ${data.audience}` : ""}`, 1800, undefined, data.clientId);
    if (!result.data?.body) {
      return NextResponse.json({ error: result.error ?? "Couldn't write the email. Try again." }, { status: 502 });
    }

    const r = result.data;
    const payload = {
      subject: stripDashes(String(r.subject ?? "")).slice(0, 300),
      preview: stripDashes(String(r.preview ?? "")).slice(0, 200),
      body: stripDashes(String(r.body ?? "")).slice(0, 3000),
    };
    logToolRun("spintax", data.clientId, user.id, data.brief.slice(0, 80), result.tokens, payload);
    return NextResponse.json(payload);
  },
);
