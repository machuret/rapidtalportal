import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { GraduationCap, ThumbsDown } from "lucide-react";
import { AnswersToReview, type ReviewItem } from "@/components/vault/AnswersToReview";
import { BrainMemoryPanel } from "@/components/brain/BrainMemoryPanel";
import { BrainLearningInbox } from "@/components/brain/BrainLearningInbox";
import {
  loadBrainMemory,
  loadBrainSignals,
  loadVaultFeedback,
  resolveBrainPicker,
} from "../loaders";
import { withPortalDataTimeout } from "@/lib/server-data-timeout";

export const dynamic = "force-dynamic";
export const metadata = { title: "Brain Learning — RapidTal" };

const WINDOW_DAYS = 30;

export default async function BrainLearningPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ client?: string }> }) {
  const searchParams = await searchParamsPromise;
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user, client } = ctx;
  if (!["client_admin", "super_admin"].includes(user.role)) redirect("/brain");

  const admin = createAdminClient();
  const { clientId, clientOptions, selectedClientName } = await resolveBrainPicker(admin, user, searchParams.client);
  if (!clientId) redirect("/dashboard");

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [memory, signals, feedback] = await withPortalDataTimeout(Promise.all([
    loadBrainMemory(admin, clientId),
    loadBrainSignals(admin, clientId, since),
    loadVaultFeedback(admin, clientId, since),
  ]), "Brain learning");

  const pendingSignals = signals.filter((s) => s.visibility !== "private_coach" && !s.distilled_at).length;

  const downvoted: ReviewItem[] = feedback
    .filter((f) => f.rating === -1 && !f.resolved)
    .slice(0, 12)
    .map((f) => ({
      id: f.id,
      question: f.question,
      answer: f.answer,
      sources: f.sources,
    }));

  return (
    <div>
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
          <GraduationCap className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Brain Learning</h1>
          <p className="text-zinc-400 text-sm mt-1">
            What the brain has learned for {selectedClientName ?? client?.name ?? "your team"} — review lessons, approve suggestions and fix bad answers.
          </p>
        </div>
      </div>

      {user.role === "super_admin" && clientOptions.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8">
          {clientOptions.map((option) => (
            <a
              key={option.id}
              href={`/brain/learning?client=${option.id}`}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                option.id === clientId
                  ? "bg-zinc-700 border-zinc-600 text-white"
                  : "border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600"
              }`}
            >
              {option.name}
            </a>
          ))}
        </div>
      )}

      {/* Brain memory — learned lessons, independent of Ask-the-Vault usage */}
      <BrainLearningInbox clientId={clientId} memories={memory} />
      <BrainMemoryPanel clientId={clientId} initial={memory} pendingSignals={pendingSignals} />

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
    </div>
  );
}
