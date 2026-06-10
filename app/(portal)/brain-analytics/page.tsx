import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BarChart3, MessageSquare, CheckCircle2, ThumbsUp, Circle, ThumbsDown,
} from "lucide-react";
import { KnowledgeGaps } from "@/components/vault/KnowledgeGaps";
import { PageIntro } from "@/components/layout/PageIntro";
import { AnswersToReview, type ReviewItem } from "@/components/vault/AnswersToReview";

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

  const [queriesRes, feedbackRes] = await Promise.all([
    admin.from("vault_queries").select("*")
      .eq("client_id", clientId).gte("created_at", since).order("created_at", { ascending: false }).limit(2000),
    admin.from("vault_feedback").select("*")
      .eq("client_id", clientId).gte("created_at", since).order("created_at", { ascending: false }).limit(1000),
  ]);

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
