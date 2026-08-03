/**
 * Controlled product context shared by Next.js and the vault-ask Edge Function.
 * Only these fixed values may enter the Coach prompt; browser text, URL query
 * strings and record content are deliberately excluded.
 */
export const COACH_PAGE_CONTEXTS = {
  home: {
    label: "Home",
    paths: ["/dashboard"],
    purpose: "Review what needs attention, continue unfinished work and choose the next useful action.",
    clientResponsibility: "Choose priorities, approve decisions and request work.",
    vaResponsibility: "Complete assigned work and keep progress current.",
  },
  tasks: {
    label: "Tasks",
    paths: ["/tasks"],
    purpose: "Request, assign, track and review work shared with the VA team.",
    clientResponsibility: "Set the outcome, priority and approval decision.",
    vaResponsibility: "Work assigned cards, update their status and submit completed work for review.",
  },
  messages: {
    label: "Messages",
    paths: ["/messages"],
    purpose: "Discuss work and keep team communication together.",
    clientResponsibility: "Clarify decisions and answer questions that block delivery.",
    vaResponsibility: "Ask for clarification and communicate progress; trackable work belongs in Tasks.",
  },
  notebook: {
    label: "Notebook",
    paths: ["/notebook"],
    purpose: "Maintain shared notes, procedures and working material for the active client–VA placement.",
    clientResponsibility: "Confirm important decisions and business-specific instructions.",
    vaResponsibility: "Keep reusable working notes and procedures current.",
  },
  team: {
    label: "Team",
    paths: ["/team", "/reports"],
    purpose: "Understand who is working with the client and review delivery activity.",
    clientResponsibility: "Review delivery and resolve role or priority questions.",
    vaResponsibility: "Keep work and daily delivery records current.",
  },
  content: {
    label: "Create content",
    paths: ["/content", "/compose"],
    purpose: "Move from a topic or idea to an edited, validated and approved draft.",
    clientResponsibility: "Choose the direction, confirm the company voice and approve final content.",
    vaResponsibility: "Prepare ideas, briefs and drafts, then submit them for client approval.",
  },
  leads: {
    label: "Lead Generation",
    paths: ["/lead-generation"],
    purpose: "Find businesses, review suitability, enrich useful leads and move selected records into CRM.",
    clientResponsibility: "Confirm targeting rules and decide which prospects should enter the sales workflow.",
    vaResponsibility: "Run searches, review and enrich results, and prepare suitable leads for follow-up.",
  },
  crm: {
    label: "CRM",
    paths: ["/crm"],
    purpose: "Manage contacts, pipeline stages, notes and follow-up work.",
    clientResponsibility: "Set relationship priorities and approve important outreach decisions.",
    vaResponsibility: "Keep contact details, notes and follow-up status current.",
  },
  competitors: {
    label: "Competitor insights",
    paths: ["/competitors", "/company-dna/competitors", "/content/competitors"],
    purpose: "Collect competitor material, analyse market patterns and turn useful gaps into company-specific ideas.",
    clientResponsibility: "Confirm relevant competitors and choose strategic opportunities.",
    vaResponsibility: "Review available intelligence and use approved opportunities when preparing work.",
  },
  profile: {
    label: "Company profile",
    paths: ["/company-dna"],
    purpose: "Keep the company, services, audience, priorities and voice accurate.",
    clientResponsibility: "Own and approve company identity, priorities and writing direction.",
    vaResponsibility: "Suggest missing information, but permanent company changes require client approval.",
  },
  knowledge: {
    label: "Company Knowledge",
    paths: ["/vault"],
    purpose: "Add and maintain the company material available to Coach and content generation.",
    clientResponsibility: "Confirm the material represents the company and resolve business-specific gaps.",
    vaResponsibility: "Add useful source material and retry failed processing when permitted.",
  },
  voice: {
    label: "Company Voice",
    paths: ["/content/style"],
    purpose: "Add owned writing examples and approve how generated content should sound.",
    clientResponsibility: "Approve the voice profile and required writing rules.",
    vaResponsibility: "Contribute examples or feedback; permanent voice changes require client approval.",
  },
  coach: {
    label: "RapidTal Coach",
    paths: ["/ask"],
    purpose: "Ask private questions using permitted company knowledge and current work context.",
    clientResponsibility: "Confirm any proposed action before it changes shared work.",
    vaResponsibility: "Use Coach for assigned work and confirm actions before sharing them.",
  },
  brain: {
    label: "Brain",
    paths: ["/brain", "/brain-analytics"],
    purpose: "Review knowledge, voice, learning and market readiness and resolve the gaps that limit useful outputs.",
    clientResponsibility: "Approve permanent learning and decide which readiness gaps matter most.",
    vaResponsibility: "Contribute feedback and source material; permanent learning requires client approval.",
  },
  company_report: {
    label: "Company Report",
    paths: ["/company-report"],
    purpose: "Review the company information currently available to RapidTal and identify practical gaps.",
    clientResponsibility: "Confirm business information and decide what should be completed next.",
    vaResponsibility: "Help collect missing information and flag inconsistencies for client review.",
  },
  daily_log: {
    label: "Daily Log",
    paths: ["/daily-log"],
    purpose: "Record completed work, challenges and the next working priority.",
    clientResponsibility: "Review delivery patterns and clarify priorities when needed.",
    vaResponsibility: "Keep the current day accurate and record blockers and next steps.",
  },
  my_job: {
    label: "My Job",
    paths: ["/my-job"],
    purpose: "Review the VA's role, working documents and employment information.",
    clientResponsibility: "Clarify role expectations through the appropriate team workflow.",
    vaResponsibility: "Keep required personal work records current and use Tasks for delivery work.",
  },
  sops: {
    label: "SOPs",
    paths: ["/sops"],
    purpose: "Create and follow repeatable operating procedures for recurring work.",
    clientResponsibility: "Confirm the expected process and approve important procedure changes.",
    vaResponsibility: "Follow assigned procedures and suggest practical improvements.",
  },
  tools: {
    label: "Tools",
    paths: ["/tools"],
    purpose: "Use focused assistants for a specific business task and keep the output in the relevant workflow.",
    clientResponsibility: "Choose the desired outcome and review material decisions.",
    vaResponsibility: "Prepare and refine outputs for the assigned task.",
  },
  supervision: {
    label: "Supervision",
    paths: ["/supervision"],
    purpose: "Review active VA delivery, blockers and work requiring client attention.",
    clientResponsibility: "Resolve blockers and approve or redirect submitted work.",
    vaResponsibility: "Keep work status current and submit completed work for review.",
  },
  access: {
    label: "Access",
    paths: ["/access"],
    purpose: "Share encrypted account access with authorised team members.",
    clientResponsibility: "Decide what access is appropriate and remove it when no longer required.",
    vaResponsibility: "Use only assigned credentials and never redistribute them.",
  },
  settings: {
    label: "Settings",
    paths: ["/profile", "/guide"],
    purpose: "Manage personal preferences or find product guidance.",
    clientResponsibility: "Keep personal account preferences accurate.",
    vaResponsibility: "Keep personal account preferences accurate.",
  },
} as const;

export type CoachPageContextKey = keyof typeof COACH_PAGE_CONTEXTS;
export const COACH_PAGE_CONTEXT_KEYS = Object.keys(COACH_PAGE_CONTEXTS) as CoachPageContextKey[];

export function coachPageContextForPath(pathname: string) {
  const matches = COACH_PAGE_CONTEXT_KEYS.flatMap((key) =>
    COACH_PAGE_CONTEXTS[key].paths.map((path) => ({ key, path, context: COACH_PAGE_CONTEXTS[key] })))
    .filter(({ path }) => pathname === path || pathname.startsWith(`${path}/`))
    .sort((left, right) => right.path.length - left.path.length);
  return matches[0] ?? null;
}

export function coachPageContextPrompt(key: CoachPageContextKey, role: "client" | "va") {
  const context = COACH_PAGE_CONTEXTS[key];
  return [
    `CURRENT WORKSPACE: ${context.label}`,
    `Purpose: ${context.purpose}`,
    `Client responsibility: ${context.clientResponsibility}`,
    `VA responsibility: ${context.vaResponsibility}`,
    `The authenticated speaker is the ${role}. Use this controlled workspace context to explain what belongs here, who owns the next step and where to continue.`,
    "Do not claim a record is missing, blocked, complete or ready unless the supplied company/operational context proves it.",
  ].join("\n");
}
