import { NextResponse } from "next/server";
import { z } from "zod";
import { withSuperAdmin } from "@/lib/api/with-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { providerHealthLimiter, tooManyRequests } from "@/lib/rate-limit";
import {
  advanceProspectingProviderCheck,
  PROSPECTING_PROVIDER_IDS,
  ProviderHealthError,
  providerCatalogue,
  startProspectingProviderCheck,
  type ProspectingProviderCheck,
  type ProspectingProviderId,
} from "@/lib/prospecting/provider-health";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  provider: z.enum(PROSPECTING_PROVIDER_IDS),
  checkId: z.string().uuid().optional(),
});

export const GET = withSuperAdmin(async () => {
  const db = createAdminClient();
  const { data, error } = await db.from("prospecting_provider_checks")
    .select("*").order("created_at", { ascending: false }).limit(100);
  const catalogue = providerCatalogue();
  if (error) {
    return NextResponse.json({
      configured: Boolean(process.env.APIFY_API_TOKEN),
      providers: Object.entries(catalogue).map(([id, value]) => ({ id, ...value, latestCheck: null })),
      unavailable: true,
      error: "Apply the provider-health migration to enable live scraper checks.",
    });
  }
  const latest = new Map<ProspectingProviderId, ProspectingProviderCheck>();
  for (const row of (data ?? []) as ProspectingProviderCheck[]) {
    if (!latest.has(row.provider)) latest.set(row.provider, row);
  }
  return NextResponse.json({
    configured: Boolean(process.env.APIFY_API_TOKEN),
    providers: Object.entries(catalogue).map(([id, value]) => ({
      id, ...value, latestCheck: latest.get(id as ProspectingProviderId) ?? null,
    })),
  });
});

export const POST = withSuperAdmin(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid scraper." }, { status: 422 });
  const limit = await providerHealthLimiter.check(`provider-health:${user.id}`);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
  try {
    const check = parsed.data.checkId
      ? await advanceProspectingProviderCheck(parsed.data.provider, parsed.data.checkId)
      : await startProspectingProviderCheck(parsed.data.provider, user.id);
    return NextResponse.json({ check }, { status: ["queued", "running"].includes(check.status) ? 202 : 200 });
  } catch (error) {
    if (error instanceof ProviderHealthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "The scraper check could not be completed." }, { status: 500 });
  }
});
