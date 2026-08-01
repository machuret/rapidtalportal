import { z } from "zod";

export type CoachActionIntent =
  | { type: "create_task" }
  | { type: "send_message"; audience: "client" | "va_team" }
  | { type: "update_task"; status: "todo" | "in_progress" | "review" | "done" }
  | { type: "submit_review" }
  | { type: "review_task" }
  | { type: "create_goal" }
  | { type: "create_commitment" }
  | { type: "create_memory" };

export type CoachRole = "client_admin" | "va" | "super_admin";

/**
 * Every coach mode the vault-ask edge function and the turn store accept.
 * Validate against this single definition in every proxy/route — a divergent
 * local enum in /api/vault/ask previously made the three progress modes
 * (create_goal, create_commitment, create_memory) unreachable end-to-end.
 */
export const COACH_MODES = [
  "private",
  "message_client", "message_va_team",
  "create_task", "update_task", "submit_review", "review_task",
  "create_goal", "create_commitment", "create_memory",
] as const;

export type CoachMode = (typeof COACH_MODES)[number];

export const coachModeSchema = z.enum(COACH_MODES);

/**
 * Pure first-line authorization used before database execution. The database
 * repeats these checks from the authenticated user row, so this improves the
 * response without becoming the security boundary itself.
 */
export function coachActionDenial(
  role: string,
  action: CoachActionIntent,
): string | null {
  if (action.type === "create_goal" || action.type === "create_commitment" || action.type === "create_memory") {
    return ["client_admin", "va"].includes(role) ? null : "coaching_progress_forbidden";
  }
  if (action.type === "create_task") {
    return role === "client_admin" ? null : "client_create_only";
  }
  if (action.type === "submit_review") {
    return role === "va" ? null : "va_submit_only";
  }
  if (action.type === "review_task") {
    return role === "client_admin" ? null : "client_review_only";
  }
  if (action.type === "update_task") {
    if (!["va", "client_admin"].includes(role)) return "task_update_forbidden";
    if (role === "va" && !["todo", "in_progress"].includes(action.status)) {
      return "va_terminal_status_forbidden";
    }
    return null;
  }
  const allowed = (role === "va" && action.audience === "client")
    || (role === "client_admin" && action.audience === "va_team");
  return allowed ? null : "message_audience_forbidden";
}
