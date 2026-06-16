/**
 * Server-side notification emitter.
 *
 * Fire-and-forget by design: a notification is never worth failing the action
 * that triggered it, so this swallows (and logs) every error. Call it after
 * the main mutation succeeds.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { emailConfigured, sendEmail, emailLayout, appUrl } from "@/lib/email";

/** Optional transactional-email payload for a notification. When present (and
 *  RESEND is configured) the notification is ALSO emailed to recipients — used
 *  for events that matter when the user isn't in the portal (leave decisions,
 *  task assignments, etc). The CTA links to the notification's `href`. */
export interface NotificationEmail {
  subject: string;
  heading: string;
  paragraphs: string[];
  ctaLabel?: string;
  footer?: string;
}

export interface NotificationInput {
  clientId?: string | null;
  type: string;
  title: string;
  body?: string;
  href?: string;
  email?: NotificationEmail;
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

  // Best-effort email for high-value events. Never blocks/fails the notification.
  if (n.email && emailConfigured()) await emailNotification(unique, n);
}

/** Resolve recipient emails and send the branded notification email to each. */
async function emailNotification(userIds: string[], n: NotificationInput): Promise<void> {
  if (!n.email) return;
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("users").select("email").in("id", userIds);
    const emails = ((data ?? []) as { email: string | null }[])
      .map((r) => r.email)
      .filter((e): e is string => !!e && e.includes("@"));
    if (emails.length === 0) return;

    const e = n.email;
    const cta = e.ctaLabel && n.href ? { label: e.ctaLabel, href: `${appUrl()}${n.href}` } : undefined;
    const html = emailLayout({ heading: e.heading, paragraphs: e.paragraphs, cta, footer: e.footer });
    const text = `${e.heading}\n\n${e.paragraphs.join("\n\n")}${cta ? `\n\n${cta.label}: ${cta.href}` : ""}`;
    // Send individually so recipients aren't exposed to each other.
    await Promise.all(emails.map((to) => sendEmail({ to, subject: e.subject, html, text })));
  } catch (err) {
    console.warn("[notify/email]", err);
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
