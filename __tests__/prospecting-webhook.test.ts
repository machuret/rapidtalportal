import {
  prospectingWebhookToken,
  prospectingWebhookUrl,
  verifyProspectingWebhookToken,
} from "@/lib/prospecting/webhook";

const originalSecret = process.env.PROSPECTING_WEBHOOK_SECRET;
const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

describe("prospecting provider webhook authentication", () => {
  beforeEach(() => {
    process.env.PROSPECTING_WEBHOOK_SECRET = "test-prospecting-webhook-secret-123";
    process.env.NEXT_PUBLIC_APP_URL = "https://portal.example";
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.PROSPECTING_WEBHOOK_SECRET;
    else process.env.PROSPECTING_WEBHOOK_SECRET = originalSecret;
    if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  });

  test("signs a job-specific HTTPS callback", () => {
    const jobId = "11111111-1111-4111-8111-111111111111";
    const token = prospectingWebhookToken(jobId);
    const url = new URL(prospectingWebhookUrl(jobId));
    expect(url.origin).toBe("https://portal.example");
    expect(url.pathname).toBe("/api/webhooks/prospecting/apify");
    expect(url.searchParams.get("jobId")).toBe(jobId);
    expect(url.searchParams.get("token")).toBe(token);
    expect(verifyProspectingWebhookToken(jobId, token)).toBe(true);
    expect(verifyProspectingWebhookToken("22222222-2222-4222-8222-222222222222", token)).toBe(false);
  });

  test("rejects malformed signatures and unsafe callback origins", () => {
    expect(verifyProspectingWebhookToken("11111111-1111-4111-8111-111111111111", "wrong")).toBe(false);
    process.env.NEXT_PUBLIC_APP_URL = "http://portal.example";
    expect(() => prospectingWebhookUrl("11111111-1111-4111-8111-111111111111"))
      .toThrow("must use HTTPS");
  });
});
