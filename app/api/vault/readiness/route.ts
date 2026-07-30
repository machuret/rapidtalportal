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
  const [itemsResult, gapsResult, questionCountResult] = await Promise.all([
    admin
      .from("vault_items")
      .select("id,title,status,category,tags,created_at,updated_at,indexed_at,evidence_role,authority_level,knowledge_status,time_sensitive,valid_from,valid_until,review_due_at,has_conflict")
      .eq("client_id", clientId)
      .or("evidence_role.eq.factual,evidence_role.is.null")
      .limit(5000),
    admin
      .from("vault_queries")
      .select("id,question,gap_key,gap_status,gap_importance,owner_id,recommended_source,created_at")
      .eq("client_id", clientId)
      .in("gap_status", ["open", "in_review"])
      .order("created_at", { ascending: false })
      .limit(500),
    admin
      .from("vault_queries")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId),
  ]);
  if (itemsResult.error) return serverError(itemsResult.error);
  if (gapsResult.error) return serverError(gapsResult.error);
  if (questionCountResult.error) return serverError(questionCountResult.error);

  type GapRow = {
    id: string;
    question: string;
    gap_key: string | null;
    gap_status: "open" | "in_review";
    gap_importance: VaultKnowledgeGap["importance"];
    owner_id: string | null;
    recommended_source: string | null;
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
  const grouped = new Map<string, VaultKnowledgeGap>();
  for (const row of gapRows) {
    const key = row.gap_key || row.question.trim().toLowerCase().replace(/\s+/g, " ");
    const existing = grouped.get(key);
    if (existing) {
      existing.occurrences += 1;
      continue;
    }
    grouped.set(key, {
      id: row.id,
      question: row.question.trim(),
      status: row.gap_status,
      importance: row.gap_importance,
      ownerId: row.owner_id,
      ownerName: row.owner_id ? ownerNames.get(row.owner_id) ?? "Assigned" : null,
      recommendedSource: row.recommended_source,
      occurrences: 1,
      createdAt: row.created_at,
    });
  }
  const questions = [...grouped.values()];
  return NextResponse.json(evaluateVaultReadiness({
    items: (itemsResult.data ?? []) as VaultReadinessItem[],
    gaps: questions,
    questionCount: questionCountResult.count ?? questions.length,
  }));
});
