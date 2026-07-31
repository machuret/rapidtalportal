import type { VaultCategory } from "@/types/database";

export const READINESS_CORE_CATEGORIES = [
  "service",
  "process",
  "policy",
  "reference",
] as const satisfies readonly VaultCategory[];

export type VaultReadinessStatus = "setup" | "needs_attention" | "developing" | "ready";
export type VaultReadinessAction = "add" | "index" | "gaps" | "ask" | "review" | null;

export interface VaultReadinessItem {
  id?: string;
  title?: string;
  status: string;
  category: VaultCategory | null;
  tags?: string[];
  created_at: string;
  updated_at: string | null;
  indexed_at: string | null;
  authority_level?: "authoritative" | "supporting";
  knowledge_status?: "active" | "review_required" | "superseded";
  time_sensitive?: boolean;
  valid_from?: string | null;
  valid_until?: string | null;
  review_due_at?: string | null;
  has_conflict?: boolean;
}

export type VaultGapImportance = "low" | "normal" | "high" | "critical";

export interface VaultKnowledgeGap {
  id: string;
  question: string;
  status: "open" | "in_review";
  importance: VaultGapImportance;
  ownerId: string | null;
  ownerName: string | null;
  recommendedSource: string | null;
  occurrences: number;
  createdAt: string;
}

export interface VaultTopicStrength {
  topic: string;
  sourceCount: number;
  authoritativeCount: number;
  strength: "strong" | "moderate" | "thin";
  lastUpdatedAt: string | null;
}

export interface VaultReadinessRecommendation {
  id: string;
  title: string;
  detail: string;
  action: VaultReadinessAction;
  priority: "high" | "medium" | "low";
}

export interface VaultReadiness {
  score: number;
  status: VaultReadinessStatus;
  label: string;
  summary: string;
  metrics: {
    total: number;
    ready: number;
    processing: number;
    stuckProcessing: number;
    failed: number;
    searchable: number;
    stale: number;
    authoritative: number;
    supporting: number;
    reviewRequired: number;
    superseded: number;
    expired: number;
    conflicted: number;
    timeSensitive: number;
    openGaps: number;
    questionsTested: number;
  };
  categoryCounts: Record<VaultCategory, number>;
  missingCoreCategories: VaultCategory[];
  gaps: string[];
  knowledgeGaps: VaultKnowledgeGap[];
  topics: VaultTopicStrength[];
  thinTopics: VaultTopicStrength[];
  recommendations: VaultReadinessRecommendation[];
  freshnessWindowDays: number;
}

const ALL_CATEGORIES: VaultCategory[] = [
  "service", "contact", "process", "policy", "reference", "general",
];
const PROCESSING_STALE_MS = 20 * 60 * 1000;

function ratio(value: number, total: number): number {
  return total > 0 ? value / total : 0;
}

export function evaluateVaultReadiness(args: {
  items: VaultReadinessItem[];
  gaps: Array<string | VaultKnowledgeGap>;
  questionCount?: number;
  now?: Date;
  freshnessWindowDays?: number;
}): VaultReadiness {
  const now = args.now ?? new Date();
  const freshnessWindowDays = args.freshnessWindowDays ?? 365;
  const freshnessBoundary = now.getTime() - freshnessWindowDays * 86_400_000;
  const items = args.items;
  const today = now.toISOString().slice(0, 10);
  const superseded = items.filter((item) => item.knowledge_status === "superseded").length;
  const currentItems = items.filter((item) => item.knowledge_status !== "superseded");
  const total = currentItems.length;
  const activeItems = currentItems.filter((item) => (item.knowledge_status ?? "active") === "active");
  const rawReadyItems = activeItems.filter((item) => item.status === "ready");
  const expired = rawReadyItems.filter(
    (item) => item.valid_until !== null && item.valid_until !== undefined && item.valid_until < today,
  ).length;
  const readyItems = rawReadyItems.filter(
    (item) =>
      !item.has_conflict
      && (!item.valid_from || item.valid_from <= today)
      && (!item.valid_until || item.valid_until >= today)
      && (!item.review_due_at || item.review_due_at.slice(0, 10) > today),
  );
  const processingItems = currentItems.filter(
    (item) => ["pending", "processing"].includes(item.status),
  );
  const stuckProcessing = processingItems.filter((item) => {
    const timestamp = new Date(item.updated_at ?? item.created_at).getTime();
    return Number.isFinite(timestamp) && now.getTime() - timestamp > PROCESSING_STALE_MS;
  }).length;
  const processing = Math.max(0, processingItems.length - stuckProcessing);
  const failed = currentItems.filter((item) => item.status === "error").length;
  const searchable = readyItems.filter((item) => item.indexed_at !== null).length;
  const stale = readyItems.filter((item) => {
    const timestamp = new Date(item.updated_at ?? item.created_at).getTime();
    return Number.isFinite(timestamp) && timestamp < freshnessBoundary;
  }).length;
  const reviewRequired = currentItems.filter(
    (item) =>
      (item.knowledge_status ?? "active") === "review_required"
      || (item.review_due_at !== null
        && item.review_due_at !== undefined
        && item.review_due_at.slice(0, 10) <= today),
  ).length;
  const conflicted = currentItems.filter((item) => item.has_conflict === true).length;
  const authoritative = readyItems.filter(
    (item) => (item.authority_level ?? "supporting") === "authoritative",
  ).length;
  const supporting = Math.max(0, readyItems.length - authoritative);
  const timeSensitive = currentItems.filter((item) => item.time_sensitive === true).length;
  const normalisedGaps: VaultKnowledgeGap[] = args.gaps.map((gap, index): VaultKnowledgeGap => {
    if (typeof gap === "string") {
      return {
          id: `legacy-${index}-${gap}`,
          question: gap.trim(),
          status: "open",
          importance: "normal",
          ownerId: null,
          ownerName: null,
          recommendedSource: null,
          occurrences: 1,
          createdAt: now.toISOString(),
      };
    }
    return gap;
  }).filter((gap) => gap.question.trim().length > 0);
  const knowledgeGaps = [...new Map(
    normalisedGaps.map((gap) => [gap.question.trim().toLowerCase(), gap]),
  ).values()].slice(0, 10);
  const gaps = knowledgeGaps.map((gap) => gap.question);
  const questionCount = Math.max(args.questionCount ?? gaps.length, gaps.length);
  const categoryCounts = Object.fromEntries(
    ALL_CATEGORIES.map((category) => [
      category,
      readyItems.filter((item) => item.category === category).length,
    ]),
  ) as Record<VaultCategory, number>;
  const missingCoreCategories = READINESS_CORE_CATEGORIES.filter(
    (category) => categoryCounts[category] === 0,
  );
  const ignoredTags = new Set([
    "company_profile", "company_dna", "admin_curated", "general", "reference",
    "service", "services", "process", "policy", "contact", "content",
  ]);
  const topicMap = new Map<string, {
    ids: Set<string>;
    authoritativeIds: Set<string>;
    latest: string | null;
  }>();
  for (const item of readyItems) {
    if (item.has_conflict || (item.valid_until && item.valid_until < today)) continue;
    for (const rawTag of item.tags ?? []) {
      const topic = rawTag.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
      if (topic.length < 3 || ignoredTags.has(topic)) continue;
      const entry = topicMap.get(topic) ?? {
        ids: new Set<string>(),
        authoritativeIds: new Set<string>(),
        latest: null,
      };
      const itemId = item.id ?? `${item.title ?? "item"}:${item.created_at}`;
      entry.ids.add(itemId);
      if ((item.authority_level ?? "supporting") === "authoritative") {
        entry.authoritativeIds.add(itemId);
      }
      const updated = item.updated_at ?? item.created_at;
      if (!entry.latest || updated > entry.latest) entry.latest = updated;
      topicMap.set(topic, entry);
    }
  }
  const topics: VaultTopicStrength[] = [...topicMap.entries()].map(
    ([topic, entry]): VaultTopicStrength => ({
      topic,
      sourceCount: entry.ids.size,
      authoritativeCount: entry.authoritativeIds.size,
      strength: entry.ids.size >= 3
        ? "strong"
        : entry.ids.size === 2
          ? "moderate"
          : "thin",
      lastUpdatedAt: entry.latest,
    }),
  ).sort((a, b) =>
    b.sourceCount - a.sourceCount
    || b.authoritativeCount - a.authoritativeCount
    || a.topic.localeCompare(b.topic)
  ).slice(0, 12);
  const thinTopics = topics.filter((topic) => topic.strength === "thin").slice(0, 8);

  const operationalScore = ratio(readyItems.length, total) * 35;
  const searchScore = ratio(searchable, readyItems.length) * 20;
  const coverageScore =
    ratio(READINESS_CORE_CATEGORIES.length - missingCoreCategories.length, READINESS_CORE_CATEGORIES.length) * 20;
  const freshnessScore = ratio(readyItems.length - stale, readyItems.length) * 15;
  const gapScore = questionCount === 0
    ? 0
    : (1 - Math.min(gaps.length, 10) / 10) * 10;
  const score = total === 0
    ? 0
    : Math.max(0, Math.round(
        operationalScore + searchScore + coverageScore + freshnessScore + gapScore
        - Math.min(20, reviewRequired * 4 + expired * 6 + conflicted * 8),
      ));

  let status: VaultReadinessStatus;
  if (total === 0) status = "setup";
  else if (
    failed > 0
    || stuckProcessing > 0
    || readyItems.length === 0
    || searchable < readyItems.length * 0.7
    || expired > 0
    || conflicted > 0
  ) {
    status = "needs_attention";
  } else if (
    score >= 85 &&
    missingCoreCategories.length === 0 &&
    questionCount >= 3 &&
    reviewRequired === 0
  ) status = "ready";
  else status = "developing";

  const labels: Record<VaultReadinessStatus, string> = {
    setup: "Setup required",
    needs_attention: "Needs attention",
    developing: "Developing",
    ready: "Ready for reliable AI use",
  };
  const summaries: Record<VaultReadinessStatus, string> = {
    setup: "Add authoritative company information before relying on generated answers or content.",
    needs_attention: "Fix failed or unsearchable knowledge before treating the Vault as dependable.",
    developing: "The Vault is usable, but important coverage or freshness gaps remain.",
    ready: "The Vault has strong operational health, searchable knowledge and broad company coverage.",
  };

  const recommendations: VaultReadinessRecommendation[] = [];
  if (total === 0) {
    recommendations.push({
      id: "start",
      title: "Add the company website or core documents",
      detail: "Start with services, processes, policies and frequently asked questions.",
      action: "add",
      priority: "high",
    });
  }
  if (failed > 0) {
    recommendations.push({
      id: "failed",
      title: `Repair ${failed} failed item${failed === 1 ? "" : "s"}`,
      detail: "Re-run processing so failed sources cannot create silent knowledge gaps.",
      action: "index",
      priority: "high",
    });
  }
  if (stuckProcessing > 0) {
    recommendations.push({
      id: "stuck-processing",
      title: `Restart ${stuckProcessing} stuck source${stuckProcessing === 1 ? "" : "s"}`,
      detail: "Preparation stopped before completion. Restarting is safe and keeps the saved source.",
      action: "index",
      priority: "high",
    });
  }
  const unsearchable = Math.max(0, readyItems.length - searchable);
  if (unsearchable > 0) {
    recommendations.push({
      id: "unsearchable",
      title: `Finish preparing ${unsearchable} source${unsearchable === 1 ? "" : "s"}`,
      detail: "These sources were saved but are not yet available to Ask the Brain or content generation.",
      action: "index",
      priority: "high",
    });
  }
  if (processing > 0) {
    recommendations.push({
      id: "processing",
      title: `${processing} item${processing === 1 ? " is" : "s are"} still processing`,
      detail: "Readiness will update automatically when processing completes.",
      action: null,
      priority: "medium",
    });
  }
  if (missingCoreCategories.length > 0 && total > 0) {
    recommendations.push({
      id: "coverage",
      title: `Add ${missingCoreCategories.length} missing knowledge area${missingCoreCategories.length === 1 ? "" : "s"}`,
      detail: `Coverage is missing: ${missingCoreCategories.join(", ")}.`,
      action: "add",
      priority: "medium",
    });
  }
  if (stale > 0) {
    recommendations.push({
      id: "stale",
      title: `Review ${stale} older source${stale === 1 ? "" : "s"}`,
      detail: `These sources have not changed in more than ${freshnessWindowDays} days. Confirm they remain authoritative.`,
      action: "review",
      priority: "medium",
    });
  }
  if (expired > 0 || reviewRequired > 0 || conflicted > 0) {
    const issues = [
      expired ? `${expired} expired` : "",
      reviewRequired ? `${reviewRequired} due for review` : "",
      conflicted ? `${conflicted} marked with a conflict` : "",
    ].filter(Boolean).join(", ");
    recommendations.push({
      id: "governance",
      title: "Review knowledge that is not safe to use",
      detail: `Source governance found ${issues}. These sources are excluded or flagged until reviewed.`,
      action: "review",
      priority: expired > 0 || conflicted > 0 ? "high" : "medium",
    });
  }
  if (questionCount < 3) {
    recommendations.push({
      id: "test",
      title: "Test the Vault with real questions",
      detail: questionCount === 0
        ? "No real questions have tested this knowledge yet. Ask at least three questions your team commonly receives."
        : `Only ${questionCount} real question${questionCount === 1 ? " has" : "s have"} tested this knowledge so far.`,
      action: "ask",
      priority: "medium",
    });
  }
  if (gaps.length > 0) {
    recommendations.push({
      id: "gaps",
      title: `Answer ${gaps.length} open knowledge gap${gaps.length === 1 ? "" : "s"}`,
      detail: "These are real questions the Vault could not answer.",
      action: "gaps",
      priority: gaps.length >= 5 ? "high" : "medium",
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      id: "maintain",
      title: "Keep the Vault current",
      detail: "Review source freshness and unanswered questions monthly.",
      action: null,
      priority: "low",
    });
  }

  return {
    score,
    status,
    label: labels[status],
    summary: summaries[status],
    metrics: {
      total,
      ready: readyItems.length,
      processing,
      stuckProcessing,
      failed,
      searchable,
      stale,
      authoritative,
      supporting,
      reviewRequired,
      superseded,
      expired,
      conflicted,
      timeSensitive,
      openGaps: gaps.length,
      questionsTested: questionCount,
    },
    categoryCounts,
    missingCoreCategories: [...missingCoreCategories],
    gaps,
    knowledgeGaps,
    topics,
    thinTopics,
    recommendations,
    freshnessWindowDays,
  };
}
