/**
 * POST /api/tools/follow-up — Follow-up Sequence Generator.
 * Paste the initial cold email → a 4-touch follow-up sequence, each touch with
 * a send day, subject, body and the angle it works. RapidTal house style.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withTool } from "@/lib/tools/handler";
import { companyContext, toolJson, logToolRun, stripDashes, clampArr } from "@/lib/tools/ai";
import { renderPrompt, getPromptTemplate } from "@/lib/prompts/server";

export const maxDuration = 60;

const schema = z.object({
  clientId: z.string().uuid(),
  email: z.string().min(20).max(6000),
});

interface Touch { day: number; subject: string; body: string; purpose: string }

export const POST = withTool(
  { slug: "follow-up", schema, invalid: "Paste the initial email you sent." },
  async ({ data, user }) => {
    const [ctx, outreachStyle] = await Promise.all([
      companyContext(data.clientId),
      getPromptTemplate("style.outreach"),
    ]);
    const voice = ctx.brandVoice ? `\nMatch this brand voice: ${ctx.brandVoice}` : "";

    const system = await renderPrompt("tools.follow-up", {
      outreach_style: outreachStyle,
      voice,
    });

    const result = await toolJson<{ touches: Touch[] }>(system, `Initial email:\n${data.email}`, 2500, undefined, data.clientId);
    if (!result.data?.touches?.length) {
      return NextResponse.json({ error: result.error ?? "Couldn't build the sequence. Try again." }, { status: 502 });
    }

    const touches = clampArr(result.data.touches, 4)
      .filter((t) => t.body?.trim())
      .map((t, i) => ({
        day: Number(t.day) || [3, 7, 12, 20][i] || i + 1,
        subject: stripDashes(String(t.subject ?? "")).slice(0, 300),
        body: stripDashes(String(t.body ?? "")).slice(0, 2000),
        purpose: stripDashes(String(t.purpose ?? "")).slice(0, 120),
      }));
    logToolRun("follow-up", data.clientId, user.id, data.email.split("\n").find(Boolean)?.slice(0, 80) ?? "follow-up sequence", result.tokens, { touches }, result.brainContextSnapshotId);
    return NextResponse.json({ touches });
  },
);
