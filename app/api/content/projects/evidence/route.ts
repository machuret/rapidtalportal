import { NextResponse } from "next/server";
import { z } from "zod";
import { assertClientAccess } from "@/lib/api-auth";
import { serverError } from "@/lib/api/errors";
import { withAuth } from "@/lib/api/with-auth";
import { aiGenerateLimiter, tooManyRequests } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { rankEvidenceCandidates } from "@/lib/content/evidence-ranking";
import { matchSemanticEvidence } from "@/lib/content/semantic-evidence";

interface EvidenceRow {
  id: string;
  title: string;
  category: string | null;
  ai_summary: string | null;
  raw_content: string | null;
  source_url: string | null;
}

const querySchema = z.object({
  client_id: z.string().uuid(),
  project_id: z.string().uuid(),
});

export const GET = withAuth(async (req, { user }) => {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    client_id: searchParams.get("client_id"),
    project_id: searchParams.get("project_id"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid evidence query." }, { status: 400 });
  }
  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  // This GET runs a semantic (brain-embed edge) retrieval on every call, so
  // rate-limit it like the other AI surfaces to cap uncapped edge invocations.
  const rl = await aiGenerateLimiter.check(`evidence:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  const db = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: project, error: projectError } = await db
    .from("content_projects")
    .select("id,title,content_brief,vault_source_ids")
    .eq("id", parsed.data.project_id)
    .eq("client_id", parsed.data.client_id)
    .maybeSingle();
  if (projectError) return serverError(projectError);
  if (!project) return NextResponse.json({ error: "Content project not found." }, { status: 404 });

  const { data, error } = await db
    .from("vault_items")
    .select("id,title,category,ai_summary,raw_content,source_url")
    .eq("client_id", parsed.data.client_id)
    .eq("status", "ready")
    .eq("evidence_role", "factual")
    .eq("knowledge_status", "active")
    .eq("has_conflict", false)
    .or(`valid_from.is.null,valid_from.lte.${today}`)
    .or(`valid_until.is.null,valid_until.gte.${today}`)
    .or(`review_due_at.is.null,review_due_at.gt.${today}`)
    .order("updated_at", { ascending: false })
    .limit(60);
  if (error) return serverError(error);

  const rows = [...((data ?? []) as EvidenceRow[])];
  const brief = project.content_brief && typeof project.content_brief === "object"
    ? project.content_brief as Record<string, unknown>
    : {};
  const evidenceQuery = [
    project.title,
    brief.objective,
    brief.audience,
    brief.angle,
    brief.additionalGuidance,
    ...(Array.isArray(brief.keyPoints) ? brief.keyPoints : []),
  ].filter((value): value is string => typeof value === "string").join(" ");
  const semantic = await matchSemanticEvidence(db, parsed.data.client_id, evidenceQuery, 60);
  const requiredIds = Array.from(new Set([
    ...(project.vault_source_ids ?? []),
    ...semantic.matches.map((match) => match.itemId),
  ]));
  const missingRequired = requiredIds.filter(
    (id) => !rows.some((item) => item.id === id),
  );
  if (missingRequired.length) {
    const { data: selected, error: selectedError } = await db
      .from("vault_items")
      .select("id,title,category,ai_summary,raw_content,source_url")
      .eq("client_id", parsed.data.client_id)
      .eq("status", "ready")
      .eq("evidence_role", "factual")
      .eq("knowledge_status", "active")
      .eq("has_conflict", false)
      .or(`valid_from.is.null,valid_from.lte.${today}`)
      .or(`valid_until.is.null,valid_until.gte.${today}`)
      .or(`review_due_at.is.null,review_due_at.gt.${today}`)
      .in("id", missingRequired);
    if (selectedError) return serverError(selectedError);
    rows.push(...((selected ?? []) as EvidenceRow[]));
  }

  const rowById = new Map(rows.map((item) => [item.id, item]));
  const selectedIds = project.vault_source_ids ?? [];
  const pinned = selectedIds.flatMap((id) => {
    const item = rowById.get(id);
    return item ? [item] : [];
  });
  const pinnedSet = new Set(pinned.map((item) => item.id));
  const semanticRanked = semantic.matches.flatMap((match) => {
    const item = rowById.get(match.itemId);
    return item && !pinnedSet.has(item.id) ? [item] : [];
  });
  const rankedSet = new Set([...pinned, ...semanticRanked].map((item) => item.id));
  const lexicalRanked = rankEvidenceCandidates(evidenceQuery, rows)
    .filter((item) => !rankedSet.has(item.id));
  const ranked = [...pinned, ...semanticRanked, ...lexicalRanked];
  const semanticById = new Map(semantic.matches.map((match) => [match.itemId, match]));
  const recommendedIds = new Set(
    (semanticRanked.length ? semanticRanked : lexicalRanked)
      .filter((item) => Boolean(item.ai_summary || item.raw_content))
      .slice(0, 3)
      .map((item) => item.id),
  );

  return NextResponse.json(ranked.map((item) => ({
    id: item.id,
    title: item.title,
    category: item.category ?? "general",
    excerpt: (semanticById.get(item.id)?.excerpt || item.ai_summary || item.raw_content || "").slice(0, 800),
    sourceUrl: item.source_url ?? null,
    relevance: semanticById.get(item.id)?.similarity ?? null,
    selectionMethod: pinnedSet.has(item.id)
      ? "selected"
      : semanticById.has(item.id)
        ? "semantic"
        : "lexical",
    recommended: recommendedIds.has(item.id),
  })));
});
