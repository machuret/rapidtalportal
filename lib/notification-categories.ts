/**
 * Notification categories — the user-facing groups people can toggle in their
 * preferences (per channel: in-app and email). Pure data + helpers, safe to
 * import from client components (no server-only deps). The notify() engine maps
 * each raw notification `type` to one of these categories; unmapped/system
 * types are always delivered.
 */
export type NotifChannel = "in_app" | "email";

export interface NotificationCategory {
  key: string;
  label: string;
  description: string;
  /** Roles that can receive this category — used to show only relevant rows. */
  roles: string[];
}

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  { key: "tasks",     label: "New tasks assigned to me",   description: "When a task is assigned to you.",                         roles: ["va"] },
  { key: "approvals", label: "Approvals & change requests", description: "When your delivered work is approved or sent back.",     roles: ["va"] },
  { key: "review",    label: "Work ready for my review",    description: "When a VA marks work ready for you to approve.",         roles: ["client_admin", "super_admin"] },
  { key: "comments",  label: "Comments on tasks",           description: "When someone comments on a task you're on.",            roles: ["va", "client_admin", "super_admin"] },
  { key: "leave",     label: "Leave requests & decisions",  description: "Requests (for admins) and approve/decline outcomes (for VAs).", roles: ["va", "client_admin", "super_admin"] },
  { key: "daily_log", label: "Daily-log feedback",          description: "When an admin leaves feedback on your daily log.",       roles: ["va"] },
  { key: "content",   label: "Content approvals",           description: "When a content piece you made is approved.",            roles: ["va"] },
  { key: "issues",    label: "Issues raised",               description: "When a VA raises an issue for mediation.",              roles: ["super_admin"] },
];

/** Raw notification `type` → category key. Types not listed are always sent. */
export const TYPE_TO_CATEGORY: Record<string, string> = {
  task_assigned:    "tasks",
  task_approved:    "approvals",
  task_changes:     "approvals",
  task_review:      "review",
  task_comment:     "comments",
  leave:            "leave",
  log_feedback:     "daily_log",
  content_approved: "content",
  issue:            "issues",
};

export type NotificationPrefs = Record<string, { in_app?: boolean; email?: boolean }>;

/**
 * Whether a recipient wants a given category on a channel. Everything defaults
 * to ON — a missing category or channel means "send it" — so users only ever
 * store the things they've turned OFF, and existing users are unaffected.
 */
export function prefAllows(
  prefs: NotificationPrefs | null | undefined,
  category: string | undefined,
  channel: NotifChannel,
): boolean {
  if (!category) return true; // uncategorised / system notifications always send
  return prefs?.[category]?.[channel] !== false;
}

/** Categories relevant to a role (for the settings UI). */
export function categoriesForRole(role: string): NotificationCategory[] {
  return NOTIFICATION_CATEGORIES.filter((c) => c.roles.includes(role));
}
