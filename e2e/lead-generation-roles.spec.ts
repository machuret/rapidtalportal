import { expect, test, type Page } from "@playwright/test";

type Role = "ADMIN" | "CLIENT_ADMIN" | "VA";

async function signIn(page: Page, role: Role) {
  const email = process.env[`E2E_${role}_EMAIL`];
  const password = process.env[`E2E_${role}_PASSWORD`];
  if (!email || !password) throw new Error(`Missing signed-in browser credentials for ${role}.`);
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.endsWith("/login")),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

async function createAndArchiveCampaign(page: Page, clientId: string, marker: string) {
  const created = await page.request.post("/api/prospecting/campaigns", {
    data: {
      clientId,
      name: marker,
      source: "google_maps",
      query: "accountant",
      location: "Sydney, Australia",
      maxResults: 10,
    },
  });
  expect(created.status()).toBe(201);
  const campaign = await created.json() as { campaign: { id: string } };
  const archived = await page.request.patch("/api/prospecting/campaigns", {
    data: { clientId, id: campaign.campaign.id, archived: true },
  });
  expect(archived.status()).toBe(200);
}

test.describe("signed-in Lead Generation roles", () => {
  test("client admin can use the review-first workspace", async ({ page }) => {
    const clientId = process.env.E2E_CLIENT_ADMIN_CLIENT_ID;
    if (!clientId) throw new Error("Missing E2E_CLIENT_ADMIN_CLIENT_ID.");
    await signIn(page, "CLIENT_ADMIN");
    await page.goto("/lead-generation");
    await expect(page.getByRole("heading", { name: "Lead Generation" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Find leads" })).toBeVisible();
    await expect(page.getByText("Nothing is added to CRM automatically.")).toBeVisible();
    await createAndArchiveCampaign(page, clientId, `Client admin acceptance ${Date.now()}`);
  });

  test("VA has the same deliberate campaign capability", async ({ page }) => {
    const clientId = process.env.E2E_CLIENT_ADMIN_CLIENT_ID;
    if (!clientId) throw new Error("Missing E2E_CLIENT_ADMIN_CLIENT_ID.");
    await signIn(page, "VA");
    await page.goto("/lead-generation");
    await expect(page.getByRole("heading", { name: "Lead Generation" })).toBeVisible();
    await createAndArchiveCampaign(page, clientId, `VA acceptance ${Date.now()}`);
  });

  test("super admin can inspect a selected tenant through the API", async ({ page }) => {
    const clientId = process.env.E2E_CLIENT_ADMIN_CLIENT_ID;
    if (!clientId) throw new Error("Missing E2E_CLIENT_ADMIN_CLIENT_ID.");
    await signIn(page, "ADMIN");
    const response = await page.request.get(`/api/prospecting/campaigns?clientId=${clientId}`);
    expect(response.status()).toBe(200);
  });

  test("client admin cannot read or mutate another tenant's prospecting data", async ({ page }) => {
    const otherClientId = process.env.E2E_OTHER_CLIENT_ID;
    if (!otherClientId) throw new Error("Missing E2E_OTHER_CLIENT_ID.");
    await signIn(page, "CLIENT_ADMIN");
    const read = await page.request.get(`/api/prospecting/leads?clientId=${otherClientId}`);
    expect(read.status()).toBe(403);
    const write = await page.request.post("/api/prospecting/campaigns", {
      data: {
        clientId: otherClientId,
        source: "google_maps",
        query: "accountant",
        location: "Sydney, Australia",
        maxResults: 10,
      },
    });
    expect(write.status()).toBe(403);
  });
});
