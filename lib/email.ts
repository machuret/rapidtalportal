/**
 * Transactional email via Resend — thin REST wrapper, no SDK dependency.
 *
 * Env-gated: if RESEND_API_KEY is unset, sends are skipped (logged, returns
 * not-configured) so the app runs fine without email wired up. NEVER throws — a
 * failed send must not break the action that triggered it; callers check `ok`.
 *
 * Setup: set RESEND_API_KEY in the hosting env, verify the sending domain in
 * Resend, and (optionally) set RESEND_FROM (default below). See docs/runbook.md.
 */
const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "RapidTal <noreply@rapidtal.online>";
  if (!key) {
    console.warn("[email] RESEND_API_KEY not set — skipping send:", input.subject);
    return { ok: false, error: "email-not-configured" };
  }
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from,
        to: Array.isArray(input.to) ? input.to : [input.to],
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[email] Resend error", res.status, body.slice(0, 300));
      return { ok: false, error: `resend ${res.status}` };
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: json.id };
  } catch (e) {
    console.error("[email] send failed:", e);
    return { ok: false, error: e instanceof Error ? e.message : "send-failed" };
  }
}

/** Escape user-supplied text before interpolating into email HTML. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Minimal branded HTML layout for transactional emails. Colours are rgb()/named
 * (no #hex) so the styles guard stays happy, and styles are inline (the only
 * thing email clients reliably support). Returns a full HTML document.
 */
export function emailLayout(opts: {
  heading: string;
  /** Body paragraphs (plain text; each becomes a <p>). */
  paragraphs: string[];
  cta?: { label: string; href: string };
  footer?: string;
}): string {
  const paras = opts.paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:rgb(39,39,42);">${escapeHtml(p)}</p>`)
    .join("");
  const button = opts.cta
    ? `<p style="margin:24px 0;"><a href="${opts.cta.href}" style="display:inline-block;background:rgb(37,99,235);color:rgb(255,255,255);text-decoration:none;padding:11px 20px;border-radius:8px;font-size:15px;font-weight:600;">${escapeHtml(opts.cta.label)}</a></p>`
    : "";
  const footer = opts.footer
    ? `<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:rgb(113,113,122);">${escapeHtml(opts.footer)}</p>`
    : "";
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:rgb(244,244,245);">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:rgb(244,244,245);padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:rgb(255,255,255);border:1px solid rgb(228,228,231);border-radius:12px;">
        <tr><td style="padding:28px 28px 8px;">
          <p style="margin:0 0 18px;font-size:18px;font-weight:700;color:rgb(24,24,27);">RapidTal</p>
          <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:rgb(24,24,27);">${escapeHtml(opts.heading)}</h1>
          ${paras}${button}${footer}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
