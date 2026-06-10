/**
 * Server-side notification emitter.
 *
 * Fire-and-forget by design: a notification is never worth failing the action
 * that triggered it, so this swallows (and logs) every error. Call it after
 * the main mutation succeeds.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export interface NotificationInput {
  clientId?: string | null;
  type: string;
  title: string;
  body?: string;
  href?: string;
}

export async function notify(recipientIds: string[], n: NotificationInput): Promise<void> {
  const unique = Array.from(new Set(recipientIds.filter(Boolean)));
  if (unique.length === 0) return;
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("notifications").insert(
      unique.map((user_id) => ({
        user_id,
        client_id: n.clientId ?? null,
        type: n.type,
        title: n.title.slice(0, 300),
        body: (n.body ?? "").slice(0, 1000),
        href: n.href ?? null,
      })),
    );
    if (error) console.warn("[notify]", error.message);
  } catch (err) {
    console.warn("[notify]", err);
  }
}

/** All client_admins of a client (e.g. "task ready for review"). */
export async function clientAdminIds(clientId: string): Promise<string[]> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("users")
      .select("id")
      .eq("client_id", clientId)
      .eq("role", "client_admin");
    return ((data ?? []) as { id: string }[]).map((u) => u.id);
  } catch {
    return [];
  }
}
