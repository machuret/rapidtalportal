import { NextResponse } from "next/server";
import { z } from "zod";
import { assertClientAccess } from "@/lib/api-auth";
import { serverError } from "@/lib/api/errors";
import { withAuth } from "@/lib/api/with-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { rankEvidenceCandidates } from "@/lib/content/evidence-ranking";

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

  const rows = [...(data ?? [])];
  const missingSelected = (project.vault_source_ids ?? []).filter(
    (id) => !rows.some((item) => item.id === id),
  );
  if (missingSelected.length) {
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
      .in("id", missingSelected);
    if (selectedError) return serverError(selectedError);
    rows.unshift(...(selected ?? []));
  }

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
  const ranked = rankEvidenceCandidates(evidenceQuery, rows);

  return NextResponse.json(ranked.map((item) => ({
    id: item.id,
    title: item.title,
    category: item.category ?? "general",
    excerpt: (item.ai_summary || item.raw_content || "").slice(0, 800),
    sourceUrl: item.source_url ?? null,
  })));
});
