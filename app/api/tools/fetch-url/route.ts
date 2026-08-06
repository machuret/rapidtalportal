/**
 * POST /api/tools/fetch-url — pull a page's text for a tool input.
 * Firecrawl single-page scrape (same tuning as vault/url) returning plain
 * markdown so VAs don't have to copy-paste page content by hand.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withTool } from "@/lib/tools/handler";
import { logToolRun } from "@/lib/tools/ai";
import { isBlockedUrl } from "@/lib/security/ssrf";

export const maxDuration = 60;

const schema = z.object({
  clientId: z.string().uuid(),
  url: z.string().url(),
});

// SSRF guard is shared + hardened in lib/security/ssrf.ts (isBlockedUrl). The
// fetch itself runs on Firecrawl's infra, so this is defense-in-depth.

export const POST = withTool(
  { slug: "fetch-url", schema, invalid: "Enter a valid URL." },
  async ({ data, user }) => {
    if (isBlockedUrl(data.url)) {
      return NextResponse.json({ error: "Only public HTTPS URLs can be fetched." }, { status: 400 });
    }

    const key = process.env.FIRECRAWL_API_KEY;
    if (!key) return NextResponse.json({ error: "FIRECRAWL_API_KEY is not configured." }, { status: 503 });

    try {
      const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          url: data.url,
          formats: ["markdown"],
          onlyMainContent: true,
          waitFor: 2500,
          timeout: 45000,
        }),
      });
      const json = await res.json();
      const content: string = json?.data?.markdown ?? json?.markdown ?? "";
      if (!res.ok || content.length < 50) {
        return NextResponse.json(
          { error: "Couldn't fetch this page — it may be slow or heavily scripted. Paste the content instead." },
          { status: 422 },
        );
      }
      const title = json?.data?.metadata?.title ?? null;
      logToolRun("fetch-url", data.clientId, user.id, data.url.slice(0, 80), 0, { title });
      return NextResponse.json({ content: content.slice(0, 30000), title });
    } catch {
      return NextResponse.json({ error: "Fetch failed — paste the content instead." }, { status: 502 });
    }
  },
);
