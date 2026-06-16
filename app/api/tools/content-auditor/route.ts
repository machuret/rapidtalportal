/**
 * POST /api/tools/content-auditor — scored audit of existing page copy.
 * Overall score + sub-scores (content depth, keyword usage, readability,
 * structure), prioritized issues, internal-link suggestions, quick wins.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withTool } from "@/lib/tools/handler";
import { toolJson, logToolRun, clampStr, clampArr } from "@/lib/tools/ai";
import { renderPrompt } from "@/lib/prompts/server";

export const maxDuration = 60;

const schema = z.object({
  clientId: z.string().uuid(),
  content: z.string().min(100).max(30000),
  keyword: z.string().max(200).optional(),
});

interface Audit {
  overall: number;
  subscores: { depth: number; keyword: number; readability: number; structure: number };
  issues: { severity: "high" | "medium" | "low"; issue: string; fix: string }[];
  internalLinks: string[];
  quickWins: string[];
}

const clamp = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

export const POST = withTool(
  { slug: "content-auditor", schema, invalid: "Paste at least a few paragraphs of page copy." },
  async ({ data, user }) => {
    const system = await renderPrompt("tools.content-auditor", {
      keyword_note: data.keyword ? ` against the target keyword "${data.keyword}"` : "",
    });

    const result = await toolJson<Audit>(system, data.content, 2500, undefined, data.clientId);
    if (!result.data?.subscores) {
      return NextResponse.json({ error: result.error ?? "Couldn't audit the copy. Try again." }, { status: 502 });
    }

    const a = result.data;
    const payload = {
      overall: clamp(a.overall),
      subscores: {
        depth: clamp(a.subscores.depth),
        keyword: clamp(a.subscores.keyword),
        readability: clamp(a.subscores.readability),
        structure: clamp(a.subscores.structure),
      },
      issues: clampArr(a.issues, 10).map((i) => ({
        severity: (["high", "medium", "low"].includes(i.severity) ? i.severity : "medium") as Audit["issues"][number]["severity"],
        issue: clampStr(i.issue, 400),
        fix: clampStr(i.fix, 400),
      })),
      internalLinks: clampArr(a.internalLinks, 6).map((l) => clampStr(l, 200)),
      quickWins: clampArr(a.quickWins, 6).map((w) => clampStr(w, 300)),
    };
    logToolRun("content-auditor", data.clientId, user.id, data.keyword || "page copy", result.tokens, payload);
    return NextResponse.json(payload);
  },
);
