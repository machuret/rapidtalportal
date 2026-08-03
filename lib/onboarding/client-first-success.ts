export const CLIENT_FIRST_SUCCESS_TOTAL = 6;

export const CLIENT_ONBOARDING_MILESTONES = [
  "company_confirmed",
  "documents_ready",
  "voice_configured",
  "coach_question_asked",
  "content_draft_created",
  "va_task_requested",
] as const;

export type ClientOnboardingMilestone = typeof CLIENT_ONBOARDING_MILESTONES[number];

export const CLIENT_ONBOARDING_MILESTONE_LABELS: Record<ClientOnboardingMilestone, string> = {
  company_confirmed: "Company confirmed",
  documents_ready: "Knowledge ready",
  voice_configured: "Voice configured",
  coach_question_asked: "Coach used",
  content_draft_created: "First draft",
  va_task_requested: "VA task requested",
};

export interface ClientFirstSuccessProgress {
  milestones: ClientOnboardingMilestone[];
  readyDocumentCount: number;
}

/** The live searchable count is deliberately never inflated by a historical
 * milestone. The milestone is represented separately in the journey copy. */
export function onboardingDocumentStepCount(progress: ClientFirstSuccessProgress) {
  return Math.max(0, progress.readyDocumentCount);
}

export type ClientFirstSuccessStepId =
  | "company"
  | "documents"
  | "voice"
  | "coach"
  | "draft"
  | "task";

export interface ClientFirstSuccessInput {
  companyComplete: boolean;
  readyDocumentCount: number;
  documentsMilestoneReached?: boolean;
  voiceConfigured: boolean;
  coachQuestionCount: number;
  draftCount: number;
  requestedTaskCount: number;
  vaAssigned: boolean;
}

export interface ClientFirstSuccessStep {
  id: ClientFirstSuccessStepId;
  title: string;
  description: string;
  actionLabel: string;
  href: string | null;
  done: boolean;
  blocked: boolean;
  progressLabel: string;
}

const hasText = (value: unknown) => typeof value === "string" && value.trim().length > 0;

export function isCompanyCoreComplete(dna: Record<string, unknown> | null) {
  if (!dna) return false;
  const required = ["company_name", "services", "target_demographic"];
  const priorities = ["business_goals", "marketing_goals"];
  return required.every((key) => hasText(dna[key])) && priorities.some((key) => hasText(dna[key]));
}

export function isCompanyVoiceConfigured(dna: Record<string, unknown> | null, approvedStyleCount: number) {
  return approvedStyleCount > 0 || Boolean(dna && (
    hasText(dna.brand_voice) || hasText(dna.content_style)
  ));
}

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * The client journey is derived from durable product records. It deliberately
 * avoids a weighted percentage: a client either reached an outcome or has one
 * clear next action that moves them closer to first value.
 */
export function buildClientFirstSuccessJourney(
  input: ClientFirstSuccessInput,
): ClientFirstSuccessStep[] {
  const documentsComplete = input.readyDocumentCount >= 3 || input.documentsMilestoneReached === true;
  return [
    {
      id: "company",
      title: "Confirm your company",
      description: "Tell RapidTal what you do, who you help and what matters now.",
      actionLabel: input.companyComplete ? "Review company" : "Confirm company",
      href: "/company-dna?setup=company",
      done: input.companyComplete,
      blocked: false,
      progressLabel: input.companyComplete ? "Core details ready" : "Core details needed",
    },
    {
      id: "documents",
      title: "Add three useful documents",
      description: "Add services, policies or guides so Coach and Content know your business.",
      actionLabel: documentsComplete ? "Review documents" : "Add documents",
      href: "/vault?setup=documents",
      done: documentsComplete,
      blocked: false,
      progressLabel: input.documentsMilestoneReached && input.readyDocumentCount < 3
        ? `First milestone reached · ${input.readyDocumentCount} currently searchable`
        : `${Math.min(input.readyDocumentCount, 3)} of 3 searchable`,
    },
    {
      id: "voice",
      title: "Choose how content should sound",
      description: "Set a simple voice so drafts sound intentional from day one.",
      actionLabel: input.voiceConfigured ? "Review voice" : "Choose voice",
      href: "/company-dna?setup=voice",
      done: input.voiceConfigured,
      blocked: false,
      progressLabel: input.voiceConfigured ? "Voice ready" : "Voice not chosen",
    },
    {
      id: "coach",
      title: "Ask Coach your first question",
      description: "Get a useful answer using the company context you just added.",
      actionLabel: input.coachQuestionCount > 0 ? "Open Coach" : "Ask a question",
      href: "/ask?setup=first-question",
      done: input.coachQuestionCount > 0,
      blocked: false,
      progressLabel: countLabel(input.coachQuestionCount, "question"),
    },
    {
      id: "draft",
      title: "Create your first draft",
      description: "Turn one topic into channel-ready content without completing a long brief.",
      actionLabel: input.draftCount > 0 ? "Open drafts" : "Create a draft",
      href: input.draftCount > 0 ? "/content/library" : "/content/quick?setup=first-draft",
      done: input.draftCount > 0,
      blocked: false,
      progressLabel: countLabel(input.draftCount, "draft"),
    },
    {
      id: "task",
      title: "Request your first VA task",
      description: input.vaAssigned
        ? "Send a real request to your VA and track it on the shared board."
        : "You can prepare work now; RapidTal will assign it when your VA is ready.",
      actionLabel: input.requestedTaskCount > 0
        ? "Open task board"
        : input.vaAssigned ? "Request work" : "Request VA assignment",
      href: input.requestedTaskCount > 0
        ? "/tasks"
        : null,
      done: input.requestedTaskCount > 0,
      blocked: !input.vaAssigned && input.requestedTaskCount === 0,
      progressLabel: input.requestedTaskCount > 0
        ? countLabel(input.requestedTaskCount, "request")
        : input.vaAssigned ? "Ready to request" : "VA placement pending",
    },
  ];
}

export function firstIncompleteStep(steps: ClientFirstSuccessStep[]) {
  return steps.find((step) => !step.done && !step.blocked) ?? null;
}

export function completedFirstSuccessSteps(steps: ClientFirstSuccessStep[]) {
  return steps.filter((step) => step.done).length;
}
