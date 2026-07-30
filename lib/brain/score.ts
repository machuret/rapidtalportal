/**
 * The Brain Score — a single, credible 0-100 number that captures how capable a
 * client's Brain is, so the /brain home can show it climbing and award a level.
 *
 * Four components (so it can't be gamed by any one lever):
 *   Knowledge  (25) — Vault docs + how complete the company profile is.
 *   Learning   (25) — active distilled lessons + feedback signals processed.
 *   Accuracy   (35) — rolling acceptance + flag precision (marked "provisional"
 *                     until there's enough decided history, so it never lies).
 *   Freshness  (15) — how recently the Brain learned or read something.
 *
 * Pure reads; safe to call from a page or the cron.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fieldKeys } from "./profile-fields";

type Admin = SupabaseClient;

// Profile fields that count toward completeness — the `completeness` concern of
// the canonical registry (lib/brain/profile-fields.ts).
const PROFILE_FIELDS = fieldKeys("completeness");

export interface BrainScore {
  score: number;          // 0-100
  level: string;          // Newborn | Learning | Sharp | Expert | Genius
  provisional: boolean;   // accuracy not yet trustworthy (little decided history)
  components: {
    knowledge: number; learning: number; accuracy: number; freshness: number;
  };
  facts: {
    docsReady: number; docsIndexed: number; profilePct: number;
    activeLessons: number; signalsProcessed: number;
    decided: number; acceptancePct: number | null; flagPrecisionPct: number | null;
    lastActivityDays: number | null;
  };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function levelFor(score: number): string {
  if (score >= 85) return "Genius";
  if (score >= 65) return "Expert";
  if (score >= 40) return "Sharp";
  if (score >= 20) return "Learning";
  return "Newborn";
}

export async function computeBrainScore(admin: Admin, clientId: string): Promise<BrainScore> {
  const today = new Date().toISOString().slice(0, 10);
  const governedReadyItems = () => admin
    .from("vault_items")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("status", "ready")
    .eq("evidence_role", "factual")
    .eq("knowledge_status", "active")
    .eq("has_conflict", false)
    .or(`valid_from.is.null,valid_from.lte.${today}`)
    .or(`valid_until.is.null,valid_until.gte.${today}`)
    .or(`review_due_at.is.null,review_due_at.gt.${today}`);
  const [dnaRes, docsReadyRes, docsIdxRes, lessonsRes, signalsRes, topicsRes, lastEventRes] = await Promise.all([
    admin.from("company_dna").select(PROFILE_FIELDS.join(", ")).eq("client_id", clientId).maybeSingle(),
    governedReadyItems(),
    governedReadyItems().not("indexed_at", "is", null),
    admin.from("brain_memory").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("active", true),
    admin.from("brain_signals").select("id", { count: "exact", head: true }).eq("client_id", clientId).not("distilled_at", "is", null),
    admin.from("content_topics").select("status, ai_flagged, updated_at").eq("client_id", clientId).in("status", ["approved", "rejected"]).limit(1000),
    admin.from("brain_events").select("created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(1),
  ]);

  const dna = (dnaRes.data ?? null) as Record<string, unknown> | null;
  const filled = dna ? PROFILE_FIELDS.filter((f) => typeof dna[f] === "string" && (dna[f] as string).trim()).length : 0;
  const profilePct = Math.round((filled / PROFILE_FIELDS.length) * 100);

  const docsReady = docsReadyRes.count ?? 0;
  const docsIndexed = docsIdxRes.count ?? 0;
  const activeLessons = lessonsRes.count ?? 0;
  const signalsProcessed = signalsRes.count ?? 0;

  const decidedRows = (topicsRes.data ?? []) as { status: string; ai_flagged: boolean | null; updated_at: string }[];
  const decided = decidedRows.length;
  const approved = decidedRows.filter((t) => t.status === "approved").length;
  const acceptancePct = decided ? Math.round((approved / decided) * 100) : null;
  const flaggedDecided = decidedRows.filter((t) => t.ai_flagged);
  const flaggedRejected = flaggedDecided.filter((t) => t.status === "rejected").length;
  const flagPrecisionPct = flaggedDecided.length ? Math.round((flaggedRejected / flaggedDecided.length) * 100) : null;

  // Freshness: most recent of last event / last decided topic.
  const stamps: number[] = [];
  const lastEvent = (lastEventRes.data ?? [])[0] as { created_at: string } | undefined;
  if (lastEvent) stamps.push(new Date(lastEvent.created_at).getTime());
  for (const t of decidedRows) stamps.push(new Date(t.updated_at).getTime());
  const lastActivityDays = stamps.length ? Math.max(0, (Date.now() - Math.max(...stamps)) / 86_400_000) : null;

  // ── Components ──
  const knowledge = 25 * (0.6 * clamp01(docsReady / 20) + 0.4 * (profilePct / 100));
  const learning = 25 * (0.6 * clamp01(activeLessons / 15) + 0.4 * clamp01(signalsProcessed / 50));

  const provisional = decided < 5;
  const accNorm = acceptancePct === null ? 0 : acceptancePct / 100;
  const fpNorm = flagPrecisionPct === null ? accNorm : flagPrecisionPct / 100;
  // Until there's real history, give a modest provisional credit rather than 0.
  const accuracy = provisional ? 35 * 0.35 : 35 * (0.7 * accNorm + 0.3 * fpNorm);

  const freshness = lastActivityDays === null ? 15 * 0.3 : 15 * clamp01(1 - lastActivityDays / 30);

  const score = Math.round(knowledge + learning + accuracy + freshness);
  return {
    score,
    level: levelFor(score),
    provisional,
    components: {
      knowledge: Math.round(knowledge),
      learning: Math.round(learning),
      accuracy: Math.round(accuracy),
      freshness: Math.round(freshness),
    },
    facts: {
      docsReady, docsIndexed, profilePct, activeLessons, signalsProcessed,
      decided, acceptancePct, flagPrecisionPct,
      lastActivityDays: lastActivityDays === null ? null : Math.round(lastActivityDays),
    },
  };
}
