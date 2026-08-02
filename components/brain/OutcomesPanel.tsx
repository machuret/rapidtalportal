import { ClipboardCheck, FileCheck2, Target } from "lucide-react";
import { FieldTip } from "@/components/ui/tooltip";
import type {
  CoachActionOutcomes,
  ContentKeptStats,
  OpportunityEffectiveness,
} from "@/lib/brain/outcomes";

/**
 * Outcomes — did the Brain's work actually help? Purely presentational; all
 * data is computed server-side from client-scoped rows. This panel is
 * reporting-only by design (migration 091 keeps performance data out of the
 * learning loop), which the footer note states plainly.
 */

const ACTION_TYPE_LABELS: Record<string, string> = {
  create_task: "tasks created",
  update_task: "tasks updated",
  send_message: "messages sent",
  submit_review: "reviews submitted",
  review_task: "tasks reviewed",
};

function formatHoursToDone(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours)} hours`;
  const days = hours / 24;
  return `${days >= 10 ? Math.round(days) : days.toFixed(1).replace(/\.0$/, "")} days`;
}

function SubSection({ icon: Icon, tint, title, tip, children }: {
  icon: typeof ClipboardCheck;
  tint: string;
  title: string;
  tip: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 shrink-0 ${tint}`} />
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <FieldTip text={tip} />
      </div>
      {children}
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-zinc-500">{children}</p>;
}

export function OutcomesPanel({
  coach,
  kept,
  opportunities,
  windowDays,
}: {
  coach: CoachActionOutcomes;
  kept: ContentKeptStats;
  opportunities: OpportunityEffectiveness;
  windowDays: number;
}) {
  const { createTask } = coach;
  const measuredOpportunities = opportunities.distribution
    .filter((d) => d.status !== "unmeasured" && d.count > 0);

  return (
    <section className="surface-card mt-6 p-6">
      <h2 className="text-lg font-semibold text-white mb-1">Did it work?</h2>
      <p className="text-xs text-zinc-500 mb-6">
        What happened after the Brain acted — Coach actions, AI drafts and suggested opportunities, last {windowDays} days.
      </p>

      <div className="flex flex-col gap-6">
        {/* 1 · Coach action efficacy */}
        <SubSection
          icon={ClipboardCheck}
          tint="text-blue-400"
          title="Coach actions"
          tip="When the Coach drafts an action (like creating a task) and someone confirms it, a receipt is recorded. This shows how many confirmed actions succeeded — and whether the tasks your Coach created actually got finished."
        >
          {coach.total === 0 ? (
            <EmptyNote>
              No Coach actions yet. When someone confirms an action the Coach drafted — creating a task, sending a message — the result shows up here.
            </EmptyNote>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
                  <p className="label-section mb-1">Actions confirmed</p>
                  <p className="stat-value text-white">{coach.total}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {coach.byType.map((t) => `${t.completed + t.failed + t.processing} ${ACTION_TYPE_LABELS[t.type] ?? t.type}`).join(" · ")}
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
                  <p className="label-section mb-1">Coach tasks done</p>
                  <p className="stat-value text-white">
                    {createTask.completed === 0 ? "—" : `${createTask.done} of ${createTask.completed}`}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {createTask.completed === 0
                      ? "no tasks created yet"
                      : createTask.linked < createTask.completed
                        ? `${createTask.linked} could be matched to a task`
                        : "tasks your Coach created that got finished"}
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
                  <p className="label-section mb-1">Typical time to finish</p>
                  <p className="stat-value text-white">
                    {createTask.medianHoursToDone === null ? "—" : formatHoursToDone(createTask.medianHoursToDone)}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">median, finished Coach tasks</p>
                </div>
              </div>
              {coach.byType.some((t) => t.failed > 0) && (
                <p className="text-xs text-zinc-500 mt-3">
                  {coach.byType.reduce((sum, t) => sum + t.failed, 0)} confirmed action{coach.byType.reduce((sum, t) => sum + t.failed, 0) === 1 ? "" : "s"} failed to complete (for example, a rule blocked it).
                </p>
              )}
            </>
          )}
        </SubSection>

        {/* 2 · Content kept-ratio */}
        <SubSection
          icon={FileCheck2}
          tint="text-green-400"
          title="AI drafts you kept"
          tip="When the AI drafts content and someone approves it, we compare the original draft to the approved text. 100% means the draft was approved word-for-word; the lower the number, the more a human rewrote before approving."
        >
          {kept.pieces === 0 ? (
            <EmptyNote>
              No approved AI drafts yet. Once AI-drafted content gets approved, this shows how much of the draft survived human editing.
            </EmptyNote>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
                <p className="label-section mb-1">Draft kept on average</p>
                <p className="stat-value text-white">{kept.avgKeptPct}%</p>
                <p className="text-xs text-zinc-500 mt-0.5">of the AI&apos;s wording survived editing</p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
                <p className="label-section mb-1">Approved AI drafts</p>
                <p className="stat-value text-white">{kept.pieces}</p>
                <p className="text-xs text-zinc-500 mt-0.5">pieces with an original draft to compare</p>
              </div>
            </div>
          )}
        </SubSection>

        {/* 3 · Opportunity effectiveness */}
        <SubSection
          icon={Target}
          tint="text-amber-400"
          title="Opportunities that worked"
          tip="The Brain regularly suggests improvements (opportunities). This shows what happened to them — and, for the ones you completed, whether follow-up checks found they actually helped."
        >
          {opportunities.total === 0 ? (
            <EmptyNote>
              No opportunities suggested yet. When the Brain spots an improvement worth making and you act on it, the outcome shows up here.
            </EmptyNote>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
                  <p className="label-section mb-1">Suggested</p>
                  <p className="stat-value text-white">{opportunities.total}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{opportunities.completed} completed</p>
                </div>
                {measuredOpportunities.length > 0 && (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
                    <p className="label-section mb-1">After completing</p>
                    <p className="stat-value text-white">
                      {measuredOpportunities
                        .map((d) => `${d.count} ${d.status}`)
                        .join(" · ")}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {opportunities.distribution.find((d) => d.status === "unmeasured")?.count ?? 0} not yet measured
                    </p>
                  </div>
                )}
              </div>
              {measuredOpportunities.length === 0 && (
                <p className="text-xs text-zinc-500 mt-3">
                  None have been measured yet — effectiveness is checked after you mark an opportunity complete.
                </p>
              )}
            </>
          )}
        </SubSection>
      </div>

      <p className="mt-6 border-t border-zinc-800 pt-4 text-xs text-zinc-500">
        Reporting only — these numbers don&apos;t change what the Brain learns (yet).
      </p>
    </section>
  );
}
