/**
 * Server-side notification emitter.
 *
 * Fire-and-forget by design: a notification is never worth failing the action
 * that triggered it, so this swallows (and logs) every error. Call it after
 * the main mutation succeeds.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { emailConfigured, sendEmail, emailLayout, appUrl } from "@/lib/email";
import { TYPE_TO_CATEGORY, prefAllows, type NotificationPrefs } from "@/lib/notification-categories";

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

  const category = TYPE_TO_CATEGORY[n.type]; // undefined → always-on (system) type
  const wantEmail = !!n.email && emailConfigured();

  // Resolve recipients' prefs (+ emails) ONCE — only needed when we're filtering
  // by category or sending email. Default behaviour (no category, no email) skips it.
  const info = new Map<string, { email: string | null; prefs: NotificationPrefs }>();
  if (category || wantEmail) {
    try {
      const admin = createAdminClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (admin as any).from("users").select("id, email, notification_prefs").in("id", unique);
      for (const r of (data ?? []) as { id: string; email: string | null; notification_prefs: NotificationPrefs | null }[]) {
        info.set(r.id, { email: r.email ?? null, prefs: r.notification_prefs ?? {} });
      }
    } catch (err) {
      console.warn("[notify] prefs", err);
    }
  }

  // ── In-app ──
  const inAppIds = category ? unique.filter((id) => prefAllows(info.get(id)?.prefs, category, "in_app")) : unique;
  if (inAppIds.length > 0) {
    try {
      const admin = createAdminClient();
      const { error } = await admin.from("notifications").insert(
        inAppIds.map((user_id) => ({
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

  // ── Email (best-effort; never blocks the notification) ──
  if (wantEmail) {
    const emails = unique
      .filter((id) => prefAllows(info.get(id)?.prefs, category, "email"))
      .map((id) => info.get(id)?.email)
      .filter((e): e is string => !!e && e.includes("@"));
    if (emails.length > 0) await emailNotification(emails, n);
  }
}

/** Send the branded notification email to a resolved list of addresses. */
async function emailNotification(emails: string[], n: NotificationInput): Promise<void> {
  if (!n.email) return;
  try {
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
