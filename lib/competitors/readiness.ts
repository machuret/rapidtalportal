import type {
  CompetitorReadiness,
  CompetitorSource,
} from "@/types/competitors";

type ReadinessInput = Omit<
  CompetitorReadiness,
  | "positioning_readiness_score"
  | "editorial_readiness_score"
  | "positioning_ready"
  | "content_strategy_ready"
  | "limitations"
>;

function recentEnough(value: string | null, days: number): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) &&
    timestamp >= Date.now() - days * 86_400_000;
}

export function evaluateCompetitorReadiness(
  input: ReadinessInput,
): CompetitorReadiness {
  const editorialItems = input.article_count + input.social_post_count;
  const positioningReady = input.ready;
  const editorialScore = Math.min(100,
    Math.min(35, input.social_post_count * 4) +
    Math.min(30, input.article_count * 6) +
    Math.min(10, input.distinct_platforms * 5) +
    (input.article_count > 0 && input.social_post_count > 0 ? 10 : 0) +
    (input.content_characters >= 10_000 ? 5 : 0) +
    (recentEnough(input.latest_capture, 180) ? 10 : recentEnough(input.latest_capture, 365) ? 5 : 0)
  );
  const contentStrategyReady =
    editorialItems >= 5 &&
    input.content_characters >= 2_500 &&
    recentEnough(input.latest_capture, 365);
  const limitations: string[] = [];
  if (input.social_post_count === 0) {
    limitations.push("No social posts are captured, so social format and cadence insights are unavailable.");
  }
  if (input.article_count === 0) {
    limitations.push("No articles are captured, so editorial themes and article-format insights are unavailable.");
  }
  if (input.distinct_platforms < 2) {
    limitations.push("The evidence comes from fewer than two platforms.");
  }
  if (!recentEnough(input.latest_capture, 180)) {
    limitations.push("The latest capture is older than 180 days or undated.");
  }
  if (!positioningReady) {
    limitations.push("More website evidence is required for reliable positioning analysis.");
  } else if (!contentStrategyReady) {
    limitations.push("Website positioning can be analysed, but the corpus is not ready for broad content-strategy conclusions.");
  }
  return {
    ...input,
    positioning_readiness_score: input.readiness_score,
    editorial_readiness_score: editorialScore,
    positioning_ready: positioningReady,
    content_strategy_ready: contentStrategyReady,
    limitations,
  };
}

function normalizedHost(value: string): string | null {
  try {
    return new URL(value).hostname.toLocaleLowerCase().replace(/^www\./u, "");
  } catch {
    return null;
  }
}

function registrableDomain(host: string): string {
  const parts = host.split(".");
  const commonSecondLevelSuffixes = new Set([
    "com.au", "net.au", "org.au", "co.uk", "org.uk", "co.nz", "com.sg",
  ]);
  const suffix = parts.slice(-2).join(".");
  return commonSecondLevelSuffixes.has(suffix) && parts.length >= 3
    ? parts.slice(-3).join(".")
    : suffix;
}

export function competitorSourceIdentityWarnings(
  competitorWebsite: string | null,
  sources: Array<Pick<CompetitorSource, "url" | "platform">>,
): string[] {
  const websiteHost = competitorWebsite ? normalizedHost(competitorWebsite) : null;
  if (!websiteHost) return [];
  const websiteDomain = registrableDomain(websiteHost);
  const mismatched = sources
    .filter((source) => ["web", "rss"].includes(source.platform))
    .map((source) => ({ source, host: normalizedHost(source.url) }))
    .filter(({ host }) => host && registrableDomain(host) !== websiteDomain)
    .map(({ host }) => host as string);
  return [...new Set(mismatched)].map((host) =>
    `${host} does not appear to belong to ${websiteHost}. Move it to its own competitor before relying on comparative analysis.`
  );
}
