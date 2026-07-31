/**
 * POST /api/tools/hooks — Hook Rewriter.
 * Paste a flat post → 10 scroll-stopping first lines, each labelled with the
 * technique used so VAs learn the patterns.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withTool } from "@/lib/tools/handler";
import { companyContext, toolJson, logToolRun, clampStr, clampArr, TOOL_MODEL_MINI } from "@/lib/tools/ai";
import { renderPrompt } from "@/lib/prompts/server";

export const maxDuration = 60;

const schema = z.object({
  clientId: z.string().uuid(),
  content: z.string().min(20).max(8000),
});

interface Hook { hook: string; technique: string }

export const POST = withTool(
  { slug: "hooks", schema, invalid: "Paste the post (at least a sentence or two)." },
  async ({ data, user }) => {
    const ctx = await companyContext(data.clientId);
    const voice = ctx.brandVoice ? `\nKeep hooks compatible with this brand voice: ${ctx.brandVoice}` : "";

    const system = await renderPrompt("tools.hooks", { voice });

    const result = await toolJson<{ hooks: Hook[] }>(system, data.content, 1500, TOOL_MODEL_MINI, data.clientId);
    if (!result.data?.hooks?.length) {
      return NextResponse.json({ error: result.error ?? "Couldn't generate hooks. Try again." }, { status: 502 });
    }

    const hooks = clampArr(result.data.hooks, 10)
      .filter((h) => h.hook?.trim())
      .map((h) => ({ hook: clampStr(h.hook, 160), technique: clampStr(h.technique, 60) }));

    logToolRun("hooks", data.clientId, user.id, data.content.split("\n").find(Boolean)?.slice(0, 80) ?? "post", result.tokens, { hooks }, result.brainContextSnapshotId);
    return NextResponse.json({ hooks });
  },
);
