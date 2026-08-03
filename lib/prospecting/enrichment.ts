import { createHash } from "node:crypto";
import type { NormalizedWebsiteEnrichment } from "@/lib/prospecting/types";

export const WEBSITE_ENRICHMENT_ACTOR = "apify/website-content-crawler";
export const WEBSITE_ENRICHMENT_ADAPTER_VERSION = 1;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, limit = 5_000): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/gu, " ").trim();
  return cleaned ? cleaned.slice(0, limit) : null;
}

function safeHttpUrl(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function unique(values: Array<string | null>, limit: number): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).slice(0, limit);
}

function emailsFrom(value: string): string[] {
  return unique(
    Array.from(value.matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu), (match) => match[0].toLowerCase()),
    10,
  ).filter((email) => !email.endsWith("@example.com"));
}

function phonesFrom(value: string): string[] {
  return unique(
    Array.from(value.matchAll(/(?:\+?61|0)[2-478](?:[\s().-]*\d){8}\b/gu), (match) => match[0].replace(/\s+/gu, " ").trim()),
    10,
  );
}

function socialLinksFrom(value: string): Record<string, string> {
  const result: Record<string, string> = {};
  const patterns: Array<[string, RegExp]> = [
    ["linkedin", /https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[A-Za-z0-9_%/?=&.-]+/iu],
    ["facebook", /https?:\/\/(?:www\.)?facebook\.com\/[A-Za-z0-9_%/?=&.-]+/iu],
    ["instagram", /https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.-]+\/?/iu],
    ["youtube", /https?:\/\/(?:www\.)?youtube\.com\/[A-Za-z0-9_@/?=&.-]+/iu],
  ];
  for (const [name, pattern] of patterns) {
    const match = value.match(pattern)?.[0];
    if (match) result[name] = match.replace(/[),.;]+$/u, "");
  }
  return result;
}

export function buildWebsiteEnrichmentInput(websiteUrl: string): Record<string, unknown> {
  const url = safeHttpUrl(websiteUrl);
  if (!url) throw new Error("This lead has an invalid website URL.");
  return {
    startUrls: [{ url: url.toString() }],
    crawlerType: "playwright:adaptive",
    maxCrawlDepth: 1,
    maxCrawlPages: 5,
    maxResults: 5,
    useSitemaps: false,
    includeUrlGlobs: [`${url.origin}/**`],
    excludeUrlGlobs: [
      `${url.origin}/blog/**`, `${url.origin}/news/**`, `${url.origin}/privacy*`,
      `${url.origin}/terms*`, `${url.origin}/login*`, `${url.origin}/cart*`,
    ],
    saveHtml: false,
    saveMarkdown: true,
    storeSkippedUrls: false,
    proxyConfiguration: { useApifyProxy: true },
  };
}

export function normalizeWebsiteEnrichment(
  websiteUrl: string,
  values: unknown[],
): NormalizedWebsiteEnrichment {
  const requested = safeHttpUrl(websiteUrl);
  if (!requested) throw new Error("This lead has an invalid website URL.");
  const pages = values.flatMap((value) => {
    const row = record(value);
    const metadata = record(row.metadata);
    const pageUrl = safeHttpUrl(row.url ?? metadata.url);
    if (!pageUrl || pageUrl.hostname.replace(/^www\./u, "") !== requested.hostname.replace(/^www\./u, "")) return [];
    const content = text(row.markdown ?? row.text ?? row.content, 20_000);
    if (!content) return [];
    return [{
      url: pageUrl.toString(),
      title: text(metadata.title ?? row.title, 300),
      description: text(metadata.description ?? row.description, 1_000),
      content,
    }];
  }).slice(0, 5);
  if (!pages.length) throw new Error("The website provider returned no readable company pages.");
  const combined = pages.map((page) => `${page.title ?? ""}\n${page.description ?? ""}\n${page.content}`).join("\n");
  const title = pages.find((page) => page.title)?.title ?? null;
  const description = pages.find((page) => page.description)?.description
    ?? text(pages[0]?.content, 1_000);
  return {
    websiteUrl: requested.toString(),
    canonicalDomain: requested.hostname.replace(/^www\./u, "").toLowerCase(),
    pageCount: pages.length,
    pageUrls: unique(pages.map((page) => page.url), 5),
    title,
    description,
    contentExcerpt: text(combined, 5_000),
    emails: emailsFrom(combined),
    phones: phonesFrom(combined),
    socialLinks: socialLinksFrom(combined),
    contentHash: createHash("sha256").update(combined).digest("hex"),
  };
}
