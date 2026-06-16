/**
 * POST /api/tools/reply-assistant — incoming comment/DM → 3 on-brand replies
 * in different registers (warm, brief, redirect), matched to brand voice.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withTool } from "@/lib/tools/handler";
import { companyContext, toolJson, logToolRun, clampStr, clampArr, TOOL_MODEL_MINI } from "@/lib/tools/ai";
import { renderPrompt } from "@/lib/prompts/server";

export const maxDuration = 60;

const schema = z.object({
  clientId: z.string().uuid(),
  message: z.string().min(2).max(4000),
  context: z.string().max(500).optional(), // e.g. "they're complaining about a late delivery"
});

interface ReplyOption { style: string; text: string }

export const POST = withTool(
  { slug: "reply-assistant", schema, invalid: "Paste the comment or DM." },
  async ({ data, user }) => {
    const ctx = await companyContext(data.clientId);
    const bits = [
      ctx.companyName && `You reply as ${ctx.companyName}.`,
      ctx.brandVoice && `Brand voice: ${ctx.brandVoice}`,
      ctx.services && `What the business offers: ${ctx.services}`,
    ].filter(Boolean).join("\n");

    const system = await renderPrompt("tools.reply-assistant", { business_context: bits });

    const userMsg = `Incoming message:\n"""\n${data.message}\n"""${data.context ? `\nContext from the VA: ${data.context}` : ""}`;

    const result = await toolJson<{ replies: ReplyOption[] }>(system, userMsg, 1200, TOOL_MODEL_MINI, data.clientId);
    if (!result.data?.replies?.length) {
      return NextResponse.json({ error: result.error ?? "Couldn't draft replies. Try again." }, { status: 502 });
    }

    const replies = clampArr(result.data.replies, 3)
      .filter((r) => r.text?.trim())
      .map((r) => ({ style: clampStr(r.style, 60), text: clampStr(r.text, 800) }));

    logToolRun("reply-assistant", data.clientId, user.id, data.message.slice(0, 80), result.tokens, { replies });
    return NextResponse.json({ replies });
  },
);
