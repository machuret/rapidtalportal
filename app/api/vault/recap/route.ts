/**
 * GET /api/vault/recap?clientId=… — the readable digest of a client's Vault.
 *
 * Returns, in one call:
 *   - counts: how much is actually indexed (ready/processing/error/total)
 *   - dossier: the full Company Dossier (raw_content) if one exists
 *   - catalog: the full Product Catalog (raw_content) if one exists
 *   - items: every other item with its recap (ai_summary) + status, no heavy
 *            raw_content, so the page stays light even for large vaults
 */
import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";

const LIGHT = "id, source_type, title, source_url, status, category, tags, ai_summary, created_at";

interface LightItem {
  id: string; source_type: string; title: string; source_url: string | null;
  status: string; category: string | null; tags: string[]; ai_summary: string | null; created_at: string;
}

const isDossier = (i: LightItem) => (i.tags ?? []).includes("dossier") || /^company dossier/i.test(i.title);
const isCatalog = (i: LightItem) => /^product catalog/i.test(i.title);

export const GET = withAuth(async (req, { user }) => {
  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "Missing clientId." }, { status: 400 });
  const denied = assertClientAccess(user, clientId);
  if (denied) return denied;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("vault_items")
    .select(LIGHT)
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) return serverError(error);

  const all = (data ?? []) as LightItem[];
  const counts = {
    total: all.length,
    ready: all.filter((i) => i.status === "ready").length,
    processing: all.filter((i) => i.status === "processing" || i.status === "pending").length,
    error: all.filter((i) => i.status === "error").length,
  };

  const dossierLight = all.find(isDossier) ?? null;
  const catalogLight = all.find(isCatalog) ?? null;

  // Pull the full text only for the two hero items.
  const heroIds = [dossierLight?.id, catalogLight?.id].filter(Boolean) as string[];
  const fullById = new Map<string, string>();
  if (heroIds.length) {
    const { data: fulls, error: fullsError } = await admin
      .from("vault_items")
      .select("id, raw_content")
      .in("id", heroIds);
    if (fullsError) return serverError(fullsError);
    for (const f of (fulls ?? []) as { id: string; raw_content: string | null }[]) {
      fullById.set(f.id, f.raw_content ?? "");
    }
  }

  const hero = (light: LightItem | null) =>
    light ? { ...light, raw_content: fullById.get(light.id) ?? "" } : null;

  const items = all.filter((i) => !isDossier(i) && !isCatalog(i));

  return NextResponse.json({
    counts,
    dossier: hero(dossierLight),
    catalog: hero(catalogLight),
    items,
  });
});
