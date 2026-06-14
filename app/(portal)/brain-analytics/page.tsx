import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BarChart3, MessageSquare, CheckCircle2, ThumbsUp, Circle, ThumbsDown,
} from "lucide-react";
import { KnowledgeGaps } from "@/components/vault/KnowledgeGaps";
import { PageIntro } from "@/components/layout/PageIntro";
import { AnswersToReview, type ReviewItem } from "@/components/vault/AnswersToReview";
import { BrainMemoryPanel, type BrainMemoryItem } from "@/components/brain/BrainMemoryPanel";
import { ProgressBar } from "@/components/ui/ProgressBar";

export const dynamic = "force-dynamic";
export const metadata = { title: "Brain Analytics — RapidTal" };

const WINDOW_DAYS = 30;

export default async function BrainAnalyticsPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user, client } = ctx;
  if (!["client_admin", "super_admin"].includes(user.role)) redirect("/dashboard");
  if (!user.client_id) redirect("/dashboard");

  const admin = createAdminClient();
  const clientId = user.client_id;
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [queriesRes, feedbackRes, memoryRes, topicsRes, signalsRes] = await Promise.all([
    admin.from("vault_queries").select("*")
      .eq("client_id", clientId).gte("created_at", since).order("created_at", { ascending: false }).limit(2000),
    admin.from("vault_feedback").select("*")
      .eq("client_id", clientId).gte("created_at", since).order("created_at", { ascending: false }).limit(1000),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from("brain_memory")
      .select("id, kind, content, confidence, source_count, active, pinned, created_at")
      .eq("client_id", clientId).order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(200),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from("content_topics")
      .select("id, status, ai_fit_score, ai_flagged, created_at, updated_at")
      .eq("client_id", clientId).order("updated_at", { ascending: false }).limit(1000),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from("brain_signals")
      .select("rating, surface, created_at").eq("client_id", clientId)
      .gte("created_at", since).limit(3000),
  ]);

  const memory = (memoryRes.error ? [] : (memoryRes.data ?? [])) as BrainMemoryItem[];

  // ── Content Brain measurement (Phase 4) ──────────────────────────────────
  type TopicRow = { status: string; ai_flagged: boolean | null; updated_at: string };
  const topics = (topicsRes.error ? [] : (topicsRes.data ?? [])) as TopicRow[];
  const signals = (signalsRes.error ? [] : (signalsRes.data ?? [])) as { rating: number; surface: string }[];

  const isDecided = (t: TopicRow) => t.status === "approved" || t.status === "rejected";
  const decided = topics.filter(isDecided);

  // Weekly acceptance trend — last 6 weeks (7-day buckets, oldest→newest).
  const WEEKS = 6;
  const now = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;
  const trend = Array.from({ length: WEEKS }, (_, i) => {
    const end = now - (WEEKS - 1 - i) * week;
    const start = end - week;
    const inBucket = decided.filter((t) => {
      const ts = new Date(t.updated_at).getTime();
      return ts > start && ts <= end;
    });
    const approved = inBucket.filter((t) => t.status === "approved").length;
    return {
      label: i === WEEKS - 1 ? "This wk" : `${WEEKS - 1 - i}w ago`,
      total: inBucket.length,
      pct: inBucket.length ? Math.round((approved / inBucket.length) * 100) : null,
    };
  });

  // Flag precision — when the Brain warned (ai_flagged), how often was the topic
  // actually rejected? (Was the warning right?)
  const flaggedDecided = decided.filter((t) => t.ai_flagged);
  const flaggedRejected = flaggedDecided.filter((t) => t.status === "rejected").length;
  const flagPrecision = flaggedDecided.length ? Math.round((flaggedRejected / flaggedDecided.length) * 100) : null;

  const contentSignals = signals.filter((s) => s.surface === "content_topic");
  const contentUp = contentSignals.filter((s) => s.rating === 1).length;
  const contentDown = contentSignals.filter((s) => s.rating === -1).length;
  const overallAccept = decided.length ? Math.round((decided.filter((t) => t.status === "approved").length / decided.length) * 100) : null;
  const hasContentBrain = topics.length > 0 || contentSignals.length > 0;

  const queries = (queriesRes.error ? [] : (queriesRes.data ?? [])) as { question: string; answered: boolean; dismissed?: boolean }[];
  const feedback = (feedbackRes.error ? [] : (feedbackRes.data ?? [])) as {
    id: string; question: string; answer: string; rating: number;
    sources?: { kind: string; title: string }[]; resolved?: boolean;
  }[];

  const asked = queries.length;
  const answered = queries.filter((q) => q.answered).length;
  const answerRate = asked ? Math.round((answered / asked) * 100) : 0;

  const up = feedback.filter((f) => f.rating === 1).length;
  const down = feedback.filter((f) => f.rating === -1).length;
  const satisfaction = up + down ? Math.round((up / (up + down)) * 100) : null;

  // Top questions (by normalised frequency), with a representative original.
  const counts = new Map<string, { count: number; sample: string }>();
  for (const q of queries) {
    const key = q.question.trim().toLowerCase().replace(/\s+/g, " ");
    if (!key) continue;
    const cur = counts.get(key);
    if (cur) cur.count++;
    else counts.set(key, { count: 1, sample: q.question.trim() });
  }
  const topQuestions = Array.from(counts.values()).sort((a, b) => b.count - a.count).slice(0, 10);

  // Distinct gaps (unanswered + not dismissed).
  const gaps: string[] = [];
  const seen = new Set<string>();
  for (const q of queries) {
    if (q.answered || q.dismissed) continue;
    const key = q.question.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    gaps.push(q.question.trim());
    if (gaps.length >= 10) break;
  }

  const downvoted: ReviewItem[] = feedback
    .filter((f) => f.rating === -1 && !f.resolved)
    .slice(0, 12)
    .map((f) => ({
      id: f.id,
      question: f.question,
      answer: f.answer,
      sources: Array.isArray(f.sources) ? f.sources : [],
    }));

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
          <BarChart3 className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Brain Analytics</h1>
          <p className="text-zinc-400 text-sm mt-1">
            How {client?.name ?? "your team"} is using the brain — last {WINDOW_DAYS} days.
          </p>
        </div>
      </div>

      <PageIntro id="brain-analytics" />

      {asked === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/50 p-12 text-center">
          <p className="text-zinc-300 font-semibold mb-1">No questions yet</p>
          <p className="text-zinc-500 text-sm">Once your team starts using Ask the Vault, usage shows up here.</p>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <Stat icon={MessageSquare} tint="text-blue-400" label="Questions" value={String(asked)} />
            <Stat icon={CheckCircle2} tint="text-green-400" label="Answer rate" value={`${answerRate}%`} />
            <Stat icon={ThumbsUp} tint="text-purple-400" label="Satisfaction" value={satisfaction === null ? "—" : `${satisfaction}%`} sub={`${up}👍 ${down}👎`} />
            <Stat icon={Circle} tint="text-amber-400" label="Open gaps" value={String(gaps.length)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top questions */}
            <section className="surface-card p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Most asked</h2>
              {topQuestions.length === 0 ? (
                <p className="text-sm text-zinc-500">No data yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {topQuestions.map((q) => (
                    <li key={q.sample} className="flex items-start gap-3">
                      <span className="text-xs font-semibold text-zinc-500 bg-zinc-800 rounded-full px-2 py-0.5 shrink-0">{q.count}×</span>
                      <span className="text-sm text-zinc-200">{q.sample}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Gaps */}
            <section className="surface-card p-6">
              <h2 className="text-lg font-semibold text-white mb-1">Knowledge gaps</h2>
              <p className="text-xs text-zinc-500 mb-4">Couldn&apos;t be answered — answer one to teach the brain, or dismiss noise.</p>
              <KnowledgeGaps gaps={gaps} clientId={clientId} canCurate />
            </section>
          </div>

          {/* Downvoted answers to fix */}
          {downvoted.length > 0 && (
            <section className="surface-card p-6 mt-6">
              <div className="flex items-center gap-2 mb-1">
                <ThumbsDown className="w-4 h-4 text-red-400" />
                <h2 className="text-lg font-semibold text-white">Answers to review</h2>
              </div>
              <p className="text-xs text-zinc-500 mb-4">Marked unhelpful — add a correction (saved as a pinned KB answer) or resolve.</p>
              <AnswersToReview items={downvoted} clientId={clientId} />
            </section>
          )}
        </>
      )}

      {/* Content Brain — how well it predicts what you'll accept, over time */}
      {hasContentBrain && (
        <section className="surface-card p-6 mt-6">
          <h2 className="text-lg font-semibold text-white mb-1">Content Brain</h2>
          <p className="text-xs text-zinc-500 mb-4">How the Brain is doing on content topics — and whether its low-fit warnings are right.</p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
              <p className="label-section mb-1">Acceptance</p>
              <p className="stat-value text-white">{overallAccept === null ? "—" : `${overallAccept}%`}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{decided.length} decided</p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
              <p className="label-section mb-1">Flag precision</p>
              <p className="stat-value text-white">{flagPrecision === null ? "—" : `${flagPrecision}%`}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{flaggedDecided.length} warned</p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
              <p className="label-section mb-1">Feedback</p>
              <p className="stat-value text-white">{contentUp + contentDown}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{contentUp}👍 {contentDown}👎</p>
            </div>
          </div>

          <p className="label-section mb-2">Weekly acceptance rate</p>
          <div className="flex flex-col gap-2">
            {trend.map((w) => (
              <div key={w.label} className="flex items-center gap-3">
                <span className="text-xs text-zinc-500 w-16 shrink-0">{w.label}</span>
                <ProgressBar
                  value={w.pct ?? 0}
                  min={w.pct === null ? 0 : 3}
                  trackClassName="h-2.5 flex-1"
                  barClassName="bg-gradient-to-r from-amber-500 to-green-500"
                />
                <span className="text-xs text-zinc-400 w-20 shrink-0 text-right tabular">
                  {w.pct === null ? "—" : `${w.pct}%`} <span className="text-zinc-600">({w.total})</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Brain memory — learned lessons, independent of Ask-the-Vault usage */}
      <BrainMemoryPanel clientId={clientId} initial={memory} />
    </div>
  );
}

function Stat({ icon: Icon, tint, label, value, sub }: {
  icon: typeof BarChart3; tint: string; label: string; value: string; sub?: string;
}) {
  return (
    <div className="surface-card px-5 py-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 shrink-0 ${tint}`} />
        <span className="label-section">{label}</span>
      </div>
      <p className="stat-value text-white">{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  );
}
