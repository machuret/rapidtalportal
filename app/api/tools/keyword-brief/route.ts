/**
 * POST /api/tools/keyword-brief — full content brief for a target keyword.
 * Returns intent, recommended title/H1, heading outline, entities to cover,
 * word-count guidance, PAA-style FAQs (with copy-ready JSON-LD) and gaps.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { toolsLimiter, tooManyRequests } from "@/lib/rate-limit";
import { authorizeTool, companyContext, toolJson } from "@/lib/tools/ai";

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

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter a target keyword." }, { status: 422 });

  const denied = authorizeTool(user, parsed.data.clientId);
  if (denied) return denied;

  const rl = toolsLimiter.check(`tools:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  const ctx = await companyContext(parsed.data.clientId);
  const contextBits = [
    ctx.companyName && `Company: ${ctx.companyName}`,
    ctx.location && `Location: ${ctx.location}`,
    ctx.services && `Services: ${ctx.services}`,
  ].filter(Boolean).join("\n");

  const system = `You are a senior SEO content strategist creating a content brief a writer can execute without further research.
${contextBits ? `\nThe brief is for this business:\n${contextBits}\n` : ""}
Return JSON exactly:
{"intent":"informational|commercial|transactional|navigational","intentNote":"one line on what the searcher wants","title":"recommended meta title ≤60 chars","h1":"recommended H1","outline":[{"h2":"section heading","h3s":["sub-points"]}],"entities":["topics, terms and entities the page must cover"],"wordCount":"e.g. 1,200–1,600 words","faqs":[{"question":"People-Also-Ask style question","answer":"concise 1-2 sentence answer"}],"gaps":["angles competitors usually miss that this page should include"]}

Rules: 4-7 outline sections, 8-15 entities, 4-6 FAQs with genuinely useful answers, 2-4 gaps. Be specific to the keyword and business, never generic filler.`;

  const userMsg = `Target keyword: ${parsed.data.keyword}` +
    (parsed.data.content?.trim()
      ? `\n\nExisting page copy (improve on it, note what's missing):\n"""\n${parsed.data.content.slice(0, 20000)}\n"""`
      : "");

  const result = await toolJson<Brief>(system, userMsg, 3000);
  if (!result.data?.outline?.length) {
    return NextResponse.json({ error: result.error ?? "Couldn't build the brief. Try again." }, { status: 502 });
  }

  const b = result.data;
  // Copy-ready FAQPage JSON-LD from the FAQs.
  const faqs = (b.faqs ?? []).filter((f) => f.question?.trim() && f.answer?.trim()).slice(0, 8);
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

  return NextResponse.json({
    intent: String(b.intent ?? "").slice(0, 40),
    intentNote: String(b.intentNote ?? "").slice(0, 300),
    title: String(b.title ?? "").slice(0, 120),
    h1: String(b.h1 ?? "").slice(0, 200),
    outline: (b.outline ?? []).slice(0, 10).map((o) => ({
      h2: String(o.h2 ?? "").slice(0, 200),
      h3s: (o.h3s ?? []).slice(0, 8).map((h) => String(h).slice(0, 200)),
    })),
    entities: (b.entities ?? []).slice(0, 20).map((e) => String(e).slice(0, 100)),
    wordCount: String(b.wordCount ?? "").slice(0, 60),
    faqs,
    gaps: (b.gaps ?? []).slice(0, 6).map((g) => String(g).slice(0, 300)),
    faqSchema,
  });
});
