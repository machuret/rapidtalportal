/**
 * Which message audiences a role may see in OTHER people's messages.
 *
 * Mirrors the messages_select RLS policy (migration 134): client admins see
 * `company` + client-private (`client`) notes; VAs see `company` + `va_team`
 * notes; super_admin (or any other role) sees everything → returns null,
 * meaning "apply no audience filter".
 *
 * A user always sees their own sends regardless of audience, so apply this only
 * alongside a `sender_id = self` OR-branch (thread reads) or a `sender_id != self`
 * predicate (unread counts / mark-read), never on its own.
 *
 * This is the single source of truth for audience visibility on the reads that
 * use the service-role admin client (dashboards, /api/messages, /api/messages/read),
 * which bypass RLS and therefore must reproduce the policy in code.
 */
export function visibleMessageAudiences(role: string): string[] | null {
  if (role === "client_admin") return ["company", "client"];
  if (role === "va") return ["company", "va_team"];
  return null;
}
