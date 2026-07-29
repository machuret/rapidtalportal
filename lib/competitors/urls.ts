import { isIP } from "node:net";
import type {
  CompetitorCrawlScope,
  CompetitorPlatform,
  CompetitorSourceType,
} from "@/types/competitors";

export interface ResolvedCompetitorUrl {
  url: string;
  normalizedUrl: string;
  sourceType: CompetitorSourceType;
  platform: CompetitorPlatform;
  crawlScope: CompetitorCrawlScope;
  pathPrefix: string | null;
  requiresConnector: boolean;
}

const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "source",
]);

const PRIVATE_V4_RANGES: Array<[number, number]> = [
  [0x00000000, 0x00ffffff],
  [0x0a000000, 0x0affffff],
  [0x64400000, 0x647fffff],
  [0x7f000000, 0x7fffffff],
  [0xa9fe0000, 0xa9feffff],
  [0xac100000, 0xac1fffff],
  [0xc0a80000, 0xc0a8ffff],
  [0xc0000000, 0xc00000ff],
  [0xc0000200, 0xc00002ff],
  [0xc6120000, 0xc613ffff],
  [0xc6336400, 0xc63364ff],
  [0xcb007100, 0xcb0071ff],
  [0xe0000000, 0xffffffff],
];

function ipv4Number(hostname: string): number | null {
  const parts = hostname.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((part) => Number(part));
  if (nums.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((nums[0] << 24) >>> 0) + (nums[1] << 16) + (nums[2] << 8) + nums[3]) >>> 0;
}

export function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost"
    || host.endsWith(".localhost")
    || host.endsWith(".local")
    || host.endsWith(".internal")
  ) return true;

  const version = isIP(host);
  if (version === 4) {
    const value = ipv4Number(host);
    return value === null || PRIVATE_V4_RANGES.some(([start, end]) => value >= start && value <= end);
  }
  if (version === 6) {
    // Public competitor sources have no legitimate reason to use mapped,
    // multicast, ULA, link-local or other non-global IPv6 space. Restrict
    // literals to global unicast (2000::/3), then exclude documentation and
    // benchmarking prefixes that sit inside that range.
    const first = Number.parseInt(host.split(":")[0] || "0", 16);
    const globalUnicast = first >= 0x2000 && first <= 0x3fff;
    return !globalUnicast
      || host.startsWith("2001:db8:")
      || host.startsWith("2001:2:");
  }
  return false;
}

function detectPlatform(hostname: string): CompetitorPlatform {
  const host = hostname.replace(/^www\./u, "");
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) return "linkedin";
  if (host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.com") return "facebook";
  if (host === "instagram.com" || host.endsWith(".instagram.com")) return "instagram";
  if (host === "x.com" || host === "twitter.com" || host.endsWith(".twitter.com")) return "x";
  if (host === "youtube.com" || host === "youtu.be" || host.endsWith(".youtube.com")) return "youtube";
  return "web";
}

function looksLikeFeed(pathname: string): boolean {
  return /(?:^|\/)(?:feed|rss|atom)(?:\/|\.xml)?$/iu.test(pathname)
    || /\.(?:rss|atom)$/iu.test(pathname);
}

export function linkedinCompanySlug(raw: string): string | null {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./u, "");
    if (
      url.protocol !== "https:"
      || (host !== "linkedin.com" && !host.endsWith(".linkedin.com"))
    ) return null;
    const match = url.pathname.match(/^\/company\/([a-z0-9][a-z0-9-]{0,99})\/?$/iu);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export function isCollectableLinkedinCompanyUrl(raw: string): boolean {
  return linkedinCompanySlug(raw) !== null;
}

function defaultClassification(url: URL): {
  sourceType: CompetitorSourceType;
  platform: CompetitorPlatform;
  scope: CompetitorCrawlScope;
  requiresConnector: boolean;
} {
  const platform = detectPlatform(url.hostname);
  if (platform === "youtube") {
    return { sourceType: "youtube", platform, scope: "profile", requiresConnector: true };
  }
  if (platform === "linkedin") {
    return {
      sourceType: "social_profile",
      platform,
      scope: "profile",
      // Public company posts can be discovered without impersonating a user.
      // Personal profiles and individual post URLs remain connector-only.
      requiresConnector: !isCollectableLinkedinCompanyUrl(url.toString()),
    };
  }
  if (["facebook", "instagram", "x"].includes(platform)) {
    return { sourceType: "social_profile", platform, scope: "profile", requiresConnector: true };
  }
  if (/sitemap(?:_index)?\.xml$/iu.test(url.pathname)) {
    return { sourceType: "sitemap", platform: "web", scope: "sitemap", requiresConnector: false };
  }
  if (looksLikeFeed(url.pathname)) {
    return { sourceType: "rss", platform: "rss", scope: "feed", requiresConnector: false };
  }
  if (/^\/(?:newsletter|archive)(?:\/)?$/iu.test(url.pathname)) {
    return { sourceType: "newsletter_archive", platform: "newsletter", scope: "path", requiresConnector: false };
  }
  if (/^\/(?:blog|articles?|insights?|news)(?:\/)?$/iu.test(url.pathname)) {
    return { sourceType: "blog", platform: "web", scope: "path", requiresConnector: false };
  }
  if (url.pathname === "/" || url.pathname === "") {
    return { sourceType: "website", platform: "web", scope: "domain", requiresConnector: false };
  }
  return { sourceType: "page", platform: "web", scope: "exact", requiresConnector: false };
}

function normalise(url: URL): string {
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if (url.port === "443") url.port = "";
  for (const key of Array.from(url.searchParams.keys())) {
    if (key.toLowerCase().startsWith("utm_") || TRACKING_PARAMS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/u, "");
  return url.toString();
}

export function resolveCompetitorUrl(
  raw: string,
  requestedScope?: "auto" | "exact" | "path" | "domain",
): ResolvedCompetitorUrl {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error("Enter a complete public HTTPS URL.");
  }

  if (parsed.protocol !== "https:") throw new Error("Only public HTTPS URLs are supported.");
  if (parsed.username || parsed.password) throw new Error("URLs containing credentials are not allowed.");
  if (parsed.port && parsed.port !== "443") throw new Error("Only the standard HTTPS port is supported.");
  if (!parsed.hostname.includes(".") || isPrivateHostname(parsed.hostname)) {
    throw new Error("Private or local network addresses are not allowed.");
  }

  const classification = defaultClassification(parsed);
  let crawlScope = classification.scope;
  let sourceType = classification.sourceType;
  if (
    requestedScope
    && requestedScope !== "auto"
    && !["social_profile", "youtube", "rss", "sitemap"].includes(sourceType)
  ) {
    crawlScope = requestedScope;
    if (requestedScope === "domain") sourceType = "website";
    else if (requestedScope === "exact") sourceType = "page";
    else if (requestedScope === "path" && sourceType === "page") sourceType = "blog";
  }

  const normalizedUrl = normalise(parsed);
  const normalized = new URL(normalizedUrl);
  const pathPrefix = crawlScope === "path"
    ? `${normalized.pathname.replace(/\/+$/u, "") || "/"}`
    : null;

  return {
    url: normalizedUrl,
    normalizedUrl,
    sourceType,
    platform: classification.platform,
    crawlScope,
    pathPrefix,
    requiresConnector: classification.requiresConnector,
  };
}

export function nextRefreshAt(
  cadence: "manual" | "daily" | "weekly" | "monthly",
  from = new Date(),
): string | null {
  if (cadence === "manual") return null;
  const next = new Date(from);
  if (cadence === "daily") next.setUTCDate(next.getUTCDate() + 1);
  if (cadence === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  if (cadence === "monthly") next.setUTCMonth(next.getUTCMonth() + 1);
  return next.toISOString();
}
