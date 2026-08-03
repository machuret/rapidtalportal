import { createHmac, timingSafeEqual } from "node:crypto";

function webhookSecret(): string {
  const secret = process.env.PROSPECTING_WEBHOOK_SECRET?.trim()
    || process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 24) {
    throw new Error("Lead collection webhook authentication is not configured.");
  }
  return secret;
}

function applicationOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim()
    || process.env.APP_URL?.trim()
    || (process.env.VERCEL_URL?.trim() ? `https://${process.env.VERCEL_URL.trim()}` : "");
  if (!raw) throw new Error("The application URL is not configured for lead collection recovery.");
  const url = new URL(raw);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("The lead collection callback URL must use HTTPS.");
  }
  return url.origin;
}

export function prospectingWebhookToken(jobId: string): string {
  return createHmac("sha256", webhookSecret())
    .update(`prospecting-apify:${jobId}`)
    .digest("hex");
}

export function assertProspectingWebhookConfigured(): void {
  webhookSecret();
  applicationOrigin();
}

export function prospectingWebhookUrl(jobId: string): string {
  const url = new URL("/api/webhooks/prospecting/apify", applicationOrigin());
  url.searchParams.set("jobId", jobId);
  url.searchParams.set("token", prospectingWebhookToken(jobId));
  return url.toString();
}

export function verifyProspectingWebhookToken(jobId: string, token: string): boolean {
  if (!/^[a-f0-9]{64}$/u.test(token)) return false;
  const expected = prospectingWebhookToken(jobId);
  const actualBuffer = Buffer.from(token, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
