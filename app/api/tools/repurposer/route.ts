/**
 * POST /api/tools/repurposer — one blog post → LinkedIn post, Facebook post,
 * Instagram caption, and 3 short-video scripts. The highest-leverage tool for
 * a marketing VA: one piece of pillar content becomes a week of social.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withTool } from "@/lib/tools/handler";
import { companyContext, toolJson, logToolRun, clampStr, clampArr } from "@/lib/tools/ai";
import { renderPrompt } from "@/lib/prompts/server";

export const maxDuration = 60;

const schema = z.object({
  clientId: z.string().uuid(),
  content: z.string().min(100).max(30000),
});

interface Repurposed {
  linkedin: string;
  facebook: string;
  instagram: string;
  scripts: { title: string; hook: string; script: string }[];
}

export const POST = withTool(
  { slug: "repurposer", schema, invalid: "Paste the blog post (at least a few paragraphs)." },
  async ({ data, user }) => {
    const ctx = await companyContext(data.clientId);
    const voice = ctx.brandVoice ? `\nBrand voice to match everywhere: ${ctx.brandVoice}` : "";

    const system = await renderPrompt("tools.repurposer", {
      for_company: ctx.companyName ? ` for ${ctx.companyName}` : "",
      voice,
    });

    // 3 posts + 3 scripts need headroom — a tight cap truncates the JSON.
    const result = await toolJson<Repurposed>(system, data.content, 5000);
    if (!result.data?.linkedin) {
      return NextResponse.json({ error: result.error ?? "Couldn't repurpose the post. Try again." }, { status: 502 });
    }

    const r = result.data;
    const payload = {
      linkedin: clampStr(r.linkedin, 5000),
      facebook: clampStr(r.facebook, 5000),
      instagram: clampStr(r.instagram, 4000),
      scripts: clampArr(r.scripts, 3).map((s) => ({
        title: clampStr(s.title, 120),
        hook: clampStr(s.hook, 200),
        script: clampStr(s.script, 2500),
      })),
    };
    logToolRun("repurposer", data.clientId, user.id, data.content.split("\n").find(Boolean)?.slice(0, 80) ?? "blog post", result.tokens, payload);
    return NextResponse.json(payload);
  },
);
