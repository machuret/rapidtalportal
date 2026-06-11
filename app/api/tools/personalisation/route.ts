/**
 * POST /api/tools/personalisation — Personalisation Line Writer.
 * Paste a prospect's website "About" text → 3 custom opening lines a VA can
 * drop into the first email so it reads researched, not blasted.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withTool } from "@/lib/tools/handler";
import { toolJson, logToolRun, stripDashes, clampArr, TOOL_MODEL_MINI } from "@/lib/tools/ai";
import { renderPrompt, getPromptTemplate } from "@/lib/prompts/server";

export const maxDuration = 60;

const schema = z.object({
  clientId: z.string().uuid(),
  about: z.string().min(40).max(6000),
});

export const POST = withTool(
  { slug: "personalisation", schema, invalid: "Paste the prospect's About / homepage text." },
  async ({ data, user }) => {
    const system = await renderPrompt("tools.personalisation", {
      outreach_style: await getPromptTemplate("style.outreach"),
    });

    const result = await toolJson<{ lines: string[] }>(system, `Prospect website text:\n${data.about}`, 800, TOOL_MODEL_MINI);
    if (!result.data?.lines?.length) {
      return NextResponse.json({ error: result.error ?? "Couldn't write the lines. Try again." }, { status: 502 });
    }

    const lines = clampArr(result.data.lines, 3)
      .filter((l) => typeof l === "string" && l.trim())
      .map((l) => stripDashes(String(l)).slice(0, 600));
    logToolRun("personalisation", data.clientId, user.id, data.about.slice(0, 80), result.tokens, { lines });
    return NextResponse.json({ lines });
  },
);
