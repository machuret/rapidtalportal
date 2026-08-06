import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { providerCatalogue, type ProspectingProviderCheck, type ProspectingProviderId } from "@/lib/prospecting/provider-health";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, { user }) => {
  const parsed = z.object({ clientId: z.string().uuid() })
    .safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "A valid client is required." }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;

  const db = createAdminClient();
  const { data, error } = await db.from("prospecting_provider_checks")
    .select("provider,status,diagnostic,completed_at,created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    return NextResponse.json({
      configured: Boolean(process.env.APIFY_API_TOKEN),
      unavailable: true,
      providers: [],
    });
  }

  const latest = new Map<ProspectingProviderId, Pick<ProspectingProviderCheck, "provider" | "status" | "diagnostic" | "completed_at" | "created_at">>();
  for (const row of (data ?? []) as Array<Pick<ProspectingProviderCheck, "provider" | "status" | "diagnostic" | "completed_at" | "created_at">>) {
    if (!latest.has(row.provider)) latest.set(row.provider, row);
  }
  const catalogue = providerCatalogue();
  const visibleProviders: ProspectingProviderId[] = ["google_maps", "google_search", "website_enrichment"];
  const staleAfter = 7 * 24 * 60 * 60_000;

  return NextResponse.json({
    configured: Boolean(process.env.APIFY_API_TOKEN),
    unavailable: false,
    providers: visibleProviders.map((id) => {
      const check = latest.get(id) ?? null;
      const checkedAt = check?.completed_at ?? check?.created_at ?? null;
      const fresh = checkedAt ? Date.now() - new Date(checkedAt).getTime() <= staleAfter : false;
      const state = !check || !fresh || ["queued", "running", "warning"].includes(check.status)
        ? "unknown"
        : check.status === "passed" ? "working" : "unavailable";
      return {
        id,
        label: catalogue[id].label,
        state,
        checkedAt,
        // The raw diagnostic is internal operational detail (Apify smoke-test
        // output). Clients see only the state; super-admins get the detail.
        diagnostic: user.role === "super_admin" ? (check?.diagnostic ?? null) : null,
      };
    }),
  });
});
