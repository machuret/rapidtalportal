/**
 * @jest-environment node
 *
 * Email helper: it sits on user-facing actions (sign-in links, etc.), so the
 * invariants that matter are that it never throws, skips cleanly when unconfigured,
 * reports failure rather than crashing the caller, and escapes interpolated text.
 */
import { sendEmail, emailLayout, escapeHtml, emailConfigured, appUrl } from "@/lib/email";

const realFetch = global.fetch;
const realKey = process.env.RESEND_API_KEY;
const realAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const realAppUrl2 = process.env.APP_URL;

afterEach(() => {
  global.fetch = realFetch;
  if (realKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = realKey;
  if (realAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = realAppUrl;
  if (realAppUrl2 === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = realAppUrl2;
});

describe("appUrl", () => {
  test("prefers NEXT_PUBLIC_APP_URL and strips trailing slashes", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com/";
    expect(appUrl()).toBe("https://app.example.com");
  });
  test("falls back to the production domain when nothing is set", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.APP_URL;
    expect(appUrl()).toMatch(/^https:\/\//);
    expect(appUrl().endsWith("/")).toBe(false);
  });
});

describe("escapeHtml", () => {
  test("escapes HTML-significant characters", () => {
    expect(escapeHtml(`<script>"&'`)).toBe("&lt;script&gt;&quot;&amp;&#39;");
  });
});

describe("emailLayout", () => {
  test("includes heading, paragraphs and a CTA link, and escapes content", () => {
    const html = emailLayout({
      heading: "Sign in",
      paragraphs: ["Hello <there>"],
      cta: { label: "Go", href: "https://x.test/a?b=1&c=2" },
    });
    expect(html).toContain("Sign in");
    expect(html).toContain("Hello &lt;there&gt;");
    expect(html).toContain('href="https://x.test/a?b=1&c=2"');
    // No raw hex colours (keeps the styles guard happy).
    expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
  });
});

describe("sendEmail", () => {
  test("skips cleanly when not configured", async () => {
    delete process.env.RESEND_API_KEY;
    expect(emailConfigured()).toBe(false);
    const r = await sendEmail({ to: "a@b.test", subject: "s", html: "<p>x</p>" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("email-not-configured");
  });

  test("returns ok with id on a 200", async () => {
    process.env.RESEND_API_KEY = "test-key";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "em_123" }),
    }) as unknown as typeof fetch;
    const r = await sendEmail({ to: "a@b.test", subject: "s", html: "<p>x</p>" });
    expect(r.ok).toBe(true);
    expect(r.id).toBe("em_123");
  });

  test("reports failure on a non-ok response (does not throw)", async () => {
    process.env.RESEND_API_KEY = "test-key";
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => "bad",
    }) as unknown as typeof fetch;
    const r = await sendEmail({ to: "a@b.test", subject: "s", html: "<p>x</p>" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("422");
  });

  test("never throws on a network error", async () => {
    process.env.RESEND_API_KEY = "test-key";
    global.fetch = jest.fn().mockRejectedValue(new Error("network")) as unknown as typeof fetch;
    const r = await sendEmail({ to: "a@b.test", subject: "s", html: "<p>x</p>" });
    expect(r.ok).toBe(false);
  });
});
