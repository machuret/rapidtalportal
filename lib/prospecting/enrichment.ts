import { createHash } from "node:crypto";
import type { NormalizedWebsiteEnrichment } from "@/lib/prospecting/types";
import providers from "@/lib/prospecting/providers.json";
import { providerInputBuilders } from "@/lib/prospecting/provider-inputs.mjs";

const WEBSITE_PROVIDER = providers.website_enrichment;
export const WEBSITE_ENRICHMENT_ACTOR = WEBSITE_PROVIDER.actorId;
export const WEBSITE_ENRICHMENT_PROVIDER_ACTOR_ID = WEBSITE_PROVIDER.providerActorId;
export const WEBSITE_ENRICHMENT_BUILD = WEBSITE_PROVIDER.build;
export const WEBSITE_ENRICHMENT_ADAPTER_VERSION = WEBSITE_PROVIDER.adapterVersion;

export interface ProspectingEnrichmentAdapter {
  readonly source: "website_enrichment";
  readonly actorId: string;
  readonly providerActorId: string;
  readonly build: string;
  readonly version: number;
  readonly maxItems: number;
  buildInput(websiteUrl: string): Record<string, unknown>;
  normalize(websiteUrl: string, values: unknown[]): NormalizedWebsiteEnrichment;
}

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

function normalizedHost(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./u, "");
}

function sameSite(left: URL, right: URL): boolean {
  const a = normalizedHost(left);
  const b = normalizedHost(right);
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

function pagePriority(url: URL, requested: URL): number {
  const path = url.pathname.toLowerCase().replace(/\/+$/u, "") || "/";
  if (sameSite(url, requested) && url.toString() === requested.toString()) return 0;
  if (sameSite(url, requested) && path === "/") return 1;
  if (/\/(about|about-us|company|who-we-are)(\/|$)/u.test(path)) return 2;
  if (/\/(services|solutions|products|what-we-do)(\/|$)/u.test(path)) return 3;
  if (/\/(contact|contact-us|get-in-touch)(\/|$)/u.test(path)) return 4;
  return 5;
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
  return providerInputBuilders.website_enrichment(websiteUrl);
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
    if (!pageUrl || !sameSite(pageUrl, requested)) return [];
    const content = text(row.markdown ?? row.text ?? row.content, 20_000);
    if (!content) return [];
    return [{
      url: pageUrl.toString(),
      title: text(metadata.title ?? row.title, 300),
      description: text(metadata.description ?? row.description, 1_000),
      content,
    }];
  }).sort((left, right) => {
    const priority = pagePriority(new URL(left.url), requested) - pagePriority(new URL(right.url), requested);
    return priority || left.url.localeCompare(right.url);
  }).slice(0, 5);
  if (!pages.length) throw new Error("The website provider returned no readable company pages.");
  const combined = pages.map((page) => `${page.url}\n${page.title ?? ""}\n${page.description ?? ""}\n${page.content}`).join("\n");
  const title = pages.find((page) => page.title)?.title ?? null;
  const description = pages.find((page) => page.description)?.description
    ?? text(pages[0]?.content, 1_000);
  return {
    websiteUrl: requested.toString(),
    canonicalDomain: normalizedHost(requested),
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

export const prospectingEnrichmentRegistry = Object.freeze({
  website_enrichment: {
    source: "website_enrichment",
    actorId: WEBSITE_ENRICHMENT_ACTOR,
    providerActorId: WEBSITE_ENRICHMENT_PROVIDER_ACTOR_ID,
    build: WEBSITE_ENRICHMENT_BUILD,
    version: WEBSITE_ENRICHMENT_ADAPTER_VERSION,
    // The provider input hard-limits collection to the homepage plus four
    // useful company pages. Normalisation still orders those pages defensively.
    maxItems: 5,
    buildInput: buildWebsiteEnrichmentInput,
    normalize: normalizeWebsiteEnrichment,
  } satisfies ProspectingEnrichmentAdapter,
});

export function getProspectingEnrichmentAdapter(
  source: keyof typeof prospectingEnrichmentRegistry,
): ProspectingEnrichmentAdapter {
  return prospectingEnrichmentRegistry[source];
}
