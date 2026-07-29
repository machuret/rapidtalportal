import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { scheduleVaultProcess } from "@/lib/vault-process-trigger";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  clientId: z.string().uuid(),
  profileUrl: z.string().url().max(2000),
  maxPosts: z.number().int().min(1).max(20).optional().default(10),
});

type SearchResult = {
  url?: unknown;
  sourceURL?: unknown;
  title?: unknown;
  markdown?: unknown;
  description?: unknown;
  snippet?: unknown;
  metadata?: {
    sourceURL?: unknown;
    url?: unknown;
    title?: unknown;
    description?: unknown;
  };
};

function parseCompanyProfile(raw: string): { url: string; slug: string } | null {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./u, "");
    const parts = url.pathname.split("/").filter(Boolean);
    if (
      url.protocol !== "https:" ||
      host !== "linkedin.com" ||
      parts.length !== 2 ||
      parts[0].toLowerCase() !== "company" ||
      !/^[a-z0-9][a-z0-9-]{1,99}$/iu.test(parts[1])
    ) return null;
    url.hostname = "www.linkedin.com";
    url.pathname = `/company/${parts[1].toLowerCase()}`;
    url.search = "";
    url.hash = "";
    return { url: url.toString().replace(/\/$/u, ""), slug: parts[1].toLowerCase() };
  } catch {
    return null;
  }
}

function normalisePublicPostUrl(raw: unknown, companySlug: string): string | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./u, "");
    const path = url.pathname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) ||
      !path.startsWith(`/posts/${companySlug}_`)
    ) return null;
    url.hostname = "www.linkedin.com";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 200_000) : "";
}

function searchResultUrl(result: SearchResult): unknown {
  return result.url
    ?? result.sourceURL
    ?? result.metadata?.sourceURL
    ?? result.metadata?.url;
}

function searchResults(json: {
  data?: { web?: SearchResult[] } | SearchResult[];
  web?: SearchResult[];
}): SearchResult[] {
  if (Array.isArray(json.data)) return json.data;
  if (Array.isArray(json.data?.web)) return json.data.web;
  return Array.isArray(json.web) ? json.web : [];
}

export const POST = withAuth(async (req, { user }) => {
  if (!["client_admin", "super_admin"].includes(user.role)) {
    return NextResponse.json({ error: "Only admins can manage LinkedIn style sources." }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;

  const profile = parseCompanyProfile(parsed.data.profileUrl);
  if (!profile) {
    return NextResponse.json(
      { error: "Enter a public LinkedIn company URL such as https://www.linkedin.com/company/company-name." },
      { status: 422 },
    );
  }

  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (!firecrawlKey) {
    return NextResponse.json({ error: "LinkedIn collection is not configured." }, { status: 503 });
  }

  const admin = createAdminClient();
  const { data: client, error: clientError } = await admin
    .from("clients")
    .select("name")
    .eq("id", parsed.data.clientId)
    .single();
  if (clientError || !client) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }

  const companyName = (client as { name: string }).name;
  const uniqueResults = new Map<string, { url: string; title: string; content: string }>();
  let lastSearchError = "";
  const queries = [
    `site:linkedin.com/posts/${profile.slug}`,
    `site:linkedin.com/posts "${companyName}"`,
  ];
  for (const query of queries) {
    if (uniqueResults.size > 0) break;
    const searchResponse = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${firecrawlKey}`,
      },
      body: JSON.stringify({
        query,
        sources: ["web"],
        includeDomains: ["linkedin.com"],
        limit: parsed.data.maxPosts,
        timeout: 60_000,
        // LinkedIn post pages are often unsuitable for a second direct scrape,
        // but they must remain eligible as public search results.
        ignoreInvalidURLs: false,
        scrapeOptions: {
          formats: [{ type: "markdown" }],
          onlyMainContent: true,
          timeout: 45_000,
        },
      }),
    });
    const searchJson = await searchResponse.json().catch(() => ({})) as {
      success?: boolean;
      error?: string;
      data?: { web?: SearchResult[] } | SearchResult[];
      web?: SearchResult[];
    };
    if (!searchResponse.ok || searchJson.success === false) {
      lastSearchError = searchJson.error ?? `Search returned ${searchResponse.status}`;
      continue;
    }
    for (const result of searchResults(searchJson)) {
      const url = normalisePublicPostUrl(searchResultUrl(result), profile.slug);
      const content = cleanText(result.markdown)
        || cleanText(result.description)
        || cleanText(result.snippet)
        || cleanText(result.metadata?.description);
      if (!url || content.length < 40 || uniqueResults.has(url)) continue;
      uniqueResults.set(url, {
        url,
        title: (
          cleanText(result.title)
          || cleanText(result.metadata?.title)
          || `${companyName} — LinkedIn post`
        ).slice(0, 200),
        content,
      });
    }
  }

  if (uniqueResults.size === 0 && lastSearchError) {
    return NextResponse.json(
      { error: lastSearchError || "LinkedIn's public results could not be collected right now." },
      { status: 502 },
    );
  }

  const { data: currentDna, error: dnaReadError } = await admin
    .from("company_dna")
    .select("id,social_links")
    .eq("client_id", parsed.data.clientId)
    .maybeSingle();
  if (dnaReadError) {
    return NextResponse.json({ error: "Company DNA could not be updated." }, { status: 500 });
  }
  const existingLinks = currentDna && typeof (currentDna as { social_links?: unknown }).social_links === "object"
    ? (currentDna as { social_links: Record<string, string> }).social_links
    : {};
  const dnaWrite = currentDna
    ? admin.from("company_dna").update({
      social_links: { ...existingLinks, linkedin: profile.url },
      updated_at: new Date().toISOString(),
    }).eq("client_id", parsed.data.clientId)
    : admin.from("company_dna").insert({
      client_id: parsed.data.clientId,
      social_links: { linkedin: profile.url },
      extra: {},
    });
  const { error: dnaWriteError } = await dnaWrite;
  if (dnaWriteError) {
    return NextResponse.json({ error: "Company DNA could not be updated." }, { status: 500 });
  }

  const items = [...uniqueResults.values()].map((result) => ({
    client_id: parsed.data.clientId,
    source_type: "url",
    title: result.title,
    source_url: result.url,
    raw_content: result.content,
    status: "processing",
    error_message: null,
    created_by: user.id,
    updated_by: user.id,
    category: "reference",
    tags: ["linkedin", "style_example", "company_owned", "social_post"],
    meta_curated: true,
    // These records are identity-managed by their canonical LinkedIn URL.
    // Avoid colliding with the global content-hash dedupe if an admin also
    // pasted the same post manually.
    content_hash: null,
    origin_key: `linkedin:${createHash("sha256").update(result.url).digest("hex")}`,
    evidence_role: "style_example" as const,
    indexed_at: null,
    index_error: null,
  }));

  if (items.length === 0) {
    return NextResponse.json({
      success: true,
      profileUrl: profile.url,
      collected: 0,
      warning: "The LinkedIn page was saved, but no public posts were discoverable. LinkedIn may be limiting public access; try again later.",
    });
  }

  const { data: saved, error: saveError } = await admin
    .from("vault_items")
    .upsert(items, { onConflict: "client_id,origin_key" })
    .select("id,title,source_url");
  if (saveError || !saved) {
    return NextResponse.json({ error: saveError?.message ?? "LinkedIn posts could not be saved." }, { status: 500 });
  }

  const itemIds = (saved as { id: string }[]).map((item) => item.id);
  const { error: chunkDeleteError } = await admin.from("vault_chunks").delete().in("item_id", itemIds);
  if (chunkDeleteError) {
    return NextResponse.json({ error: "LinkedIn posts were saved, but their search index could not be refreshed." }, { status: 500 });
  }
  for (const itemId of itemIds) scheduleVaultProcess(itemId, parsed.data.clientId);

  return NextResponse.json({
    success: true,
    profileUrl: profile.url,
    collected: saved.length,
    items: saved,
  });
});
