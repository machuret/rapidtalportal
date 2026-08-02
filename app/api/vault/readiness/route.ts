import { NextResponse } from "next/server";
import { assertClientAccess } from "@/lib/api-auth";
import { serverError } from "@/lib/api/errors";
import { withAuth } from "@/lib/api/with-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  evaluateVaultReadiness,
  type VaultKnowledgeGap,
  type VaultReadinessItem,
} from "@/lib/vault/readiness";

export const GET = withAuth(async (req, { user }) => {
  const clientId = new URL(req.url).searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ error: "Missing clientId." }, { status: 400 });
  }
  const denied = assertClientAccess(user, clientId);
  if (denied) return denied;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration follows generated schema snapshot
  const db = admin as any;
  const metricsFrom = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const [itemsResult, gapsResult, questionCountResult, privateMetricResult] = await Promise.all([
    admin
      .from("vault_items")
      .select("id,title,status,category,tags,created_at,updated_at,indexed_at,evidence_role,authority_level,knowledge_status,time_sensitive,valid_from,valid_until,review_due_at,has_conflict")
      .eq("client_id", clientId)
      .or("evidence_role.eq.factual,evidence_role.is.null")
      .limit(5000),
    admin
      .from("brain_knowledge_gaps")
      .select("id,example_questions,status,importance,owner_id,recommended_source,occurrence_count,created_at")
      .eq("client_id", clientId)
      .in("status", ["open", "in_review"])
      .order("created_at", { ascending: false })
      .limit(500),
    admin
      .from("vault_queries")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .neq("visibility", "private_coach"),
    db
      .from("coach_question_metrics_daily")
      .select("question_count")
      .eq("client_id", clientId)
      .gte("metric_date", metricsFrom),
  ]);
  if (itemsResult.error) return serverError(itemsResult.error);
  if (gapsResult.error) return serverError(gapsResult.error);
  if (questionCountResult.error) return serverError(questionCountResult.error);
  if (privateMetricResult.error) return serverError(privateMetricResult.error);

  type GapRow = {
    id: string;
    example_questions: string[];
    status: "open" | "in_review";
    importance: VaultKnowledgeGap["importance"];
    owner_id: string | null;
    recommended_source: string | null;
    occurrence_count: number;
    created_at: string;
  };
  const gapRows = (gapsResult.data ?? []) as GapRow[];
  const ownerIds = [...new Set(
    gapRows.map((row) => row.owner_id).filter((id): id is string => Boolean(id)),
  )];
  const ownerNames = new Map<string, string>();
  if (ownerIds.length) {
    const { data: owners, error: ownersError } = await admin
      .from("users")
      .select("id,full_name,email")
      .eq("client_id", clientId)
      .in("id", ownerIds);
    if (ownersError) return serverError(ownersError);
    for (const owner of owners ?? []) {
      ownerNames.set(owner.id, owner.full_name?.trim() || owner.email);
    }
  }
  const questions = gapRows.map((row): VaultKnowledgeGap => ({
      id: row.id,
      question: row.example_questions[0]?.trim() || "Unlabelled knowledge gap",
      status: row.status,
      importance: row.importance,
      ownerId: row.owner_id,
      ownerName: row.owner_id ? ownerNames.get(row.owner_id) ?? "Assigned" : null,
      recommendedSource: row.recommended_source,
      occurrences: row.occurrence_count,
      createdAt: row.created_at,
  }));
  return NextResponse.json(evaluateVaultReadiness({
    items: (itemsResult.data ?? []) as VaultReadinessItem[],
    gaps: questions,
    questionCount: (questionCountResult.count ?? 0) + (privateMetricResult.data ?? [])
      .reduce((sum: number, row: { question_count: number }) => sum + row.question_count, 0),
  }));
});
