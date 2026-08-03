"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, CheckCircle2, Circle, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import {
  CLIENT_FIRST_SUCCESS_TOTAL,
  completedFirstSuccessSteps,
  firstIncompleteStep,
  type ClientFirstSuccessStep,
} from "@/lib/onboarding/client-first-success";

export function ClientFirstSuccessJourney({
  clientId,
  steps,
  onRequestWork,
  unavailable = false,
}: {
  clientId: string;
  steps: ClientFirstSuccessStep[];
  onRequestWork: () => void;
  unavailable?: boolean;
}) {
  const router = useRouter();
  const completed = completedFirstSuccessSteps(steps);
  const next = firstIncompleteStep(steps);
  const complete = completed === CLIENT_FIRST_SUCCESS_TOTAL;
  const blocked = steps.find((step) => step.blocked && !step.done) ?? null;
  const [requestingAssignment, setRequestingAssignment] = useState(false);
  const [assignmentRequested, setAssignmentRequested] = useState(false);

  async function requestAssignment() {
    if (requestingAssignment || assignmentRequested) return;
    setRequestingAssignment(true);
    try {
      await api.post(ROUTES.onboarding.requestVa(), {});
      setAssignmentRequested(true);
    } finally {
      setRequestingAssignment(false);
    }
  }

  useEffect(() => {
    if (unavailable) return;
    void api.post(
      ROUTES.onboarding.events(),
      {
        clientId,
        step: next?.id ?? blocked?.id ?? null,
        eventType: "journey_viewed",
        metadata: { completed },
      },
      { showErrorToast: false },
    ).catch(() => undefined);
  }, [blocked?.id, clientId, completed, next?.id, unavailable]);

  if (unavailable) {
    return (
      <section className="surface-card mb-6 flex flex-wrap items-center gap-3 px-4 py-3" aria-label="Starter progress unavailable">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-300" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-100">Starter progress could not be loaded</p>
          <p className="text-xs text-zinc-500">Tasks, approvals and the rest of your dashboard are still available. No progress was changed.</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => router.refresh()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Retry progress
        </Button>
      </section>
    );
  }

  if (complete) {
    return (
      <section className="surface-card mb-6 flex flex-wrap items-center gap-3 px-4 py-3" aria-label="Starter journey complete">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-green-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-100">Your first setup wins are complete</p>
          <p className="text-xs text-zinc-500">These milestones are recorded. Home and Company readiness will continue to show anything that needs attention now.</p>
        </div>
        <Link href="/guide" className={cn(buttonVariants({ size: "sm", variant: "ghost" }), "text-zinc-400")}>
          Get more from RapidTal <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </section>
    );
  }

  return (
    <section className="surface-card mb-6 overflow-hidden" aria-labelledby="first-success-title">
      <div className="border-b border-zinc-800 bg-gradient-to-r from-amber-500/10 via-zinc-900 to-zinc-900 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-300">
              <Sparkles className="h-3.5 w-3.5" /> Your first wins
            </p>
            <h2 id="first-success-title" className="text-lg font-semibold text-white">
              Let’s get useful results quickly
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              No technical setup. Complete these practical actions in any order—we’ll always show the best next step.
            </p>
          </div>
          <div className="rounded-full border border-zinc-700 bg-zinc-950/60 px-3 py-1.5 text-sm text-zinc-300">
            <span className="font-semibold text-white">{completed}</span> of {CLIENT_FIRST_SUCCESS_TOTAL} complete
          </div>
        </div>
      </div>

      {next && (
        <div className="m-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-2xs font-semibold uppercase tracking-wide text-amber-300">Recommended next</p>
              <p className="mt-1 text-base font-semibold text-white">{next.title}</p>
              <p className="mt-1 text-sm text-zinc-400">{next.description}</p>
            </div>
            <JourneyAction step={next} onRequestWork={onRequestWork} primary />
          </div>
        </div>
      )}

      {!next && blocked && (
        <div className="m-4 rounded-xl border border-blue-500/25 bg-blue-500/5 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-blue-100">
                {assignmentRequested ? "VA assignment requested" : "Everything you can do now is complete"}
              </p>
              <p className="mt-1 text-xs leading-5 text-blue-200/70">
                {assignmentRequested
                  ? "The RapidTal team has your request. You can keep using Coach, Content and company knowledge while placement is arranged."
                  : "Request a VA assignment here—there is no need to leave this workflow or contact support separately."}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={requestingAssignment || assignmentRequested}
              onClick={() => void requestAssignment()}
              className="gap-1.5 border-blue-400/30 text-blue-100"
            >
              {requestingAssignment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
              {assignmentRequested ? "Request sent" : "Request VA assignment"}
            </Button>
          </div>
        </div>
      )}

      <ol className="grid gap-px bg-zinc-800 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.id} className="bg-zinc-950/70 p-4">
            <div className="flex items-start gap-3">
              {step.done ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-400" aria-hidden="true" />
              ) : (
                <span className="relative mt-0.5 shrink-0" aria-hidden="true">
                  <Circle className="h-5 w-5 text-zinc-600" />
                  <span className="absolute inset-0 flex items-center justify-center text-3xs font-semibold text-zinc-400">{index + 1}</span>
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-medium", step.done ? "text-zinc-300" : "text-white")}>{step.title}</p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">{step.progressLabel}</p>
                {!(step.id === "task" && step.blocked) && <JourneyAction step={step} onRequestWork={onRequestWork} />}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function JourneyAction({
  step,
  onRequestWork,
  primary = false,
}: {
  step: ClientFirstSuccessStep;
  onRequestWork: () => void;
  primary?: boolean;
}) {
  const content = (
    <>
      {step.actionLabel}
      <ArrowRight className="h-3.5 w-3.5" />
    </>
  );

  if (step.id === "task" && !step.done && !step.blocked) {
    return (
      <Button
        type="button"
        size="sm"
        variant={primary ? "default" : "ghost"}
        onClick={onRequestWork}
        className={cn("gap-1.5", !primary && "mt-2 h-auto px-0 py-1 text-xs text-zinc-400 hover:bg-transparent hover:text-white")}
      >
        {content}
      </Button>
    );
  }

  if (!step.href) return null;
  return (
    <Link
      href={step.href}
      className={cn(
        buttonVariants({ size: "sm", variant: primary ? "default" : "ghost" }),
        "gap-1.5",
        !primary && "mt-2 h-auto px-0 py-1 text-xs text-zinc-400 hover:bg-transparent hover:text-white",
      )}
    >
      {content}
    </Link>
  );
}
