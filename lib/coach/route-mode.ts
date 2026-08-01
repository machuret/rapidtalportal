/**
 * LLM coach-mode router. When a user asks the Coach something without picking
 * an action mode (the "private" default), a tiny classifier call decides
 * whether the question is really an action request ("assign this to Sarah by
 * Friday" → create_task) so the answer flow can use that mode's strict JSON
 * schema. The client-side regex (inferredCoachMode) runs first for free; this
 * is the second opinion for everything it can't catch.
 *
 * Safety: the router can only *suggest* — the result is validated against the
 * same role policy matrix as every other action (coachActionDenial), and the
 * downstream edge function re-checks the role from the DB at execution time.
 * A router mistake degrades to a private answer, never to a wrong action.
 */
import { z } from "zod";
import { coachModeSchema, coachActionDenial, type CoachActionIntent, type CoachMode } from "@/lib/brain/coach-action-policy";
import { chatProvider, chatModel } from "@/lib/brain/llm";

export type CoachActorRole = "client" | "va";

/** Map a routed mode onto the intent shape the role policy evaluates. */
export function modeToIntent(mode: CoachMode): CoachActionIntent | null {
  switch (mode) {
    case "create_task": return { type: "create_task" };
    case "update_task": return { type: "update_task", status: "todo" };
    case "submit_review": return { type: "submit_review" };
    case "review_task": return { type: "review_task" };
    case "message_client": return { type: "send_message", audience: "client" };
    case "message_va_team": return { type: "send_message", audience: "va_team" };
    case "create_goal": return { type: "create_goal" };
    case "create_commitment": return { type: "create_commitment" };
    case "create_memory": return { type: "create_memory" };
    default: return null;
  }
}

/**
 * A routed mode is usable only when the role policy would allow the matching
 * action. accountRole is the users.role value ("client_admin" | "va" | …).
 */
export function routedModeAllowed(mode: CoachMode, accountRole: string): boolean {
  if (mode === "private") return true;
  const intent = modeToIntent(mode);
  if (!intent) return false;
  return coachActionDenial(accountRole, intent) === null;
}

const classifierResponseSchema = z.object({
  mode: coachModeSchema,
  confidence: z.number().min(0).max(1),
});

export const ROUTE_MODE_CONFIDENCE = 0.6;

/**
 * Classify a question into a coach mode. Returns "private" on any failure —
 * the router is pure upside over the regex, never a new failure mode.
 */
export async function routeModeWithLlm(args: {
  question: string;
  coachRole: CoachActorRole;
}): Promise<{ mode: CoachMode; confidence: number; routed: boolean }> {
  const fallback = { mode: "private" as const, confidence: 0, routed: false };
  const llm = chatProvider();
  if (!llm) return fallback;

  const roleLabel = args.coachRole === "va" ? "a virtual assistant (VA)" : "a client admin (the business owner)";
  const userPrompt = [
    `The user is ${roleLabel} talking to their work Coach.`,
    `Question: """${args.question.slice(0, 1500)}"""`,
    "",
    "Modes:",
    "- private: a normal question/conversation, no action requested",
    "- create_task: explicitly wants a NEW task created or assigned",
    "- update_task: wants an EXISTING task changed (status, priority, date)",
    "- submit_review: a VA saying their work is ready for the client to check",
    "- review_task: a client approving or requesting changes on submitted work",
    "- message_client: a VA wanting to send a message to the client",
    "- message_va_team: a client wanting to message their VA team",
    "- create_goal: wants to track a personal/business goal",
    "- create_commitment: wants to commit to something and be checked on later",
    "- create_memory: wants the Coach to remember a preference/fact",
    "",
    'Return JSON {"mode": one of the above, "confidence": 0..1}.',
    "Only pick an action mode when the user is clearly asking for that action;",
    "questions ABOUT tasks/goals are private.",
  ].join("\n");

  let res: Response;
  try {
    res = await fetch(llm.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${llm.key}` },
      body: JSON.stringify({
        model: chatModel("COACH_ROUTER_MODEL"),
        temperature: 0,
        max_tokens: 60,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You classify Coach questions into exactly one mode. JSON only." },
          { role: "user", content: userPrompt },
        ],
      }),
    });
  } catch {
    return fallback;
  }
  if (!res.ok) return fallback;

  try {
    const raw = JSON.parse((await res.json()).choices?.[0]?.message?.content ?? "{}");
    const parsed = classifierResponseSchema.safeParse(raw);
    if (!parsed.success) return fallback;
    if (parsed.data.mode === "private" || parsed.data.confidence < ROUTE_MODE_CONFIDENCE) {
      return fallback;
    }
    return { mode: parsed.data.mode, confidence: parsed.data.confidence, routed: true };
  } catch {
    return fallback;
  }
}
