/**
 * POST /api/tools/keyword-brief — full content brief for a target keyword.
 * Returns intent, recommended title/H1, heading outline, entities to cover,
 * word-count guidance, PAA-style FAQs (with copy-ready JSON-LD) and gaps.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withTool } from "@/lib/tools/handler";
import { companyContext, toolJson, logToolRun, clampStr, clampArr } from "@/lib/tools/ai";
import { renderPrompt } from "@/lib/prompts/server";

export const maxDuration = 60;

const schema = z.object({
  clientId: z.string().uuid(),
  keyword: z.string().min(2).max(200),
  content: z.string().max(30000).optional(), // existing page copy, if any
});

interface Brief {
  intent: string;
  intentNote: string;
  title: string;
  h1: string;
  outline: { h2: string; h3s: string[] }[];
  entities: string[];
  wordCount: string;
  faqs: { question: string; answer: string }[];
  gaps: string[];
}

export const POST = withTool(
  { slug: "keyword-brief", schema, invalid: "Enter a target keyword." },
  async ({ data, user }) => {
    const ctx = await companyContext(data.clientId);
    const contextBits = [
      ctx.companyName && `Company: ${ctx.companyName}`,
      ctx.location && `Location: ${ctx.location}`,
      ctx.services && `Services: ${ctx.services}`,
    ].filter(Boolean).join("\n");

    const system = await renderPrompt("tools.keyword-brief", {
      business_context: contextBits ? `\nThe brief is for this business:\n${contextBits}\n` : "",
    });

    const userMsg = `Target keyword: ${data.keyword}` +
      (data.content?.trim()
        ? `\n\nExisting page copy (improve on it, note what's missing):\n"""\n${data.content}\n"""`
        : "");

    const result = await toolJson<Brief>(system, userMsg, 3000);
    if (!result.data?.outline?.length) {
      return NextResponse.json({ error: result.error ?? "Couldn't build the brief. Try again." }, { status: 502 });
    }

    const b = result.data;
    // Copy-ready FAQPage JSON-LD from the FAQs.
    const faqs = clampArr(b.faqs, 8).filter((f) => f.question?.trim() && f.answer?.trim());
    const faqSchema = faqs.length
      ? JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((f) => ({
            "@type": "Question",
            name: f.question,
            acceptedAnswer: { "@type": "Answer", text: f.answer },
          })),
        }, null, 2)
      : null;

    const payload = {
      intent: clampStr(b.intent, 40),
      intentNote: clampStr(b.intentNote, 300),
      title: clampStr(b.title, 120),
      h1: clampStr(b.h1, 200),
      outline: clampArr(b.outline, 10).map((o) => ({
        h2: clampStr(o.h2, 200),
        h3s: clampArr(o.h3s, 8).map((h) => clampStr(h, 200)),
      })),
      entities: clampArr(b.entities, 20).map((e) => clampStr(e, 100)),
      wordCount: clampStr(b.wordCount, 60),
      faqs,
      gaps: clampArr(b.gaps, 6).map((g) => clampStr(g, 300)),
      faqSchema,
    };
    logToolRun("keyword-brief", data.clientId, user.id, data.keyword, result.tokens, payload);
    return NextResponse.json(payload);
  },
);
