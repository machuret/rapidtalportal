/**
 * POST /api/tools/fetch-url — pull a page's text for a tool input.
 * Firecrawl single-page scrape (same tuning as vault/url) returning plain
 * markdown so VAs don't have to copy-paste page content by hand.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { toolsLimiter, tooManyRequests } from "@/lib/rate-limit";
import { authorizeTool } from "@/lib/tools/ai";

export const maxDuration = 60;

const schema = z.object({
  clientId: z.string().uuid(),
  url: z.string().url(),
});

const PRIVATE_IP_RE = /^(localhost|127\.|0\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|::1|fc00:|fe80:)/i;

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid URL." }, { status: 422 });

  const denied = authorizeTool(user, parsed.data.clientId);
  if (denied) return denied;

  try {
    const u = new URL(parsed.data.url);
    if (u.protocol !== "https:" || PRIVATE_IP_RE.test(u.hostname)) {
      return NextResponse.json({ error: "Only public HTTPS URLs can be fetched." }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Enter a valid URL." }, { status: 422 });
  }

  const rl = toolsLimiter.check(`tools:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return NextResponse.json({ error: "FIRECRAWL_API_KEY is not configured." }, { status: 503 });

  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        url: parsed.data.url,
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
    return NextResponse.json({ content: content.slice(0, 30000), title: json?.data?.metadata?.title ?? null });
  } catch {
    return NextResponse.json({ error: "Fetch failed — paste the content instead." }, { status: 502 });
  }
});
