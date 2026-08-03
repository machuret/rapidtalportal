import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, role: "CLIENT_ADMIN" | "VA") {
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

test.describe("Sprint 6 signed-in discovery and contextual Coach", () => {
  test("client can find a newly-created CRM record and open it directly", async ({ page }) => {
    const clientId = process.env.E2E_CLIENT_ADMIN_CLIENT_ID;
    if (!clientId) throw new Error("Missing E2E_CLIENT_ADMIN_CLIENT_ID.");
    await signIn(page, "CLIENT_ADMIN");
    const unique = `Discovery ${Date.now()}`;
    const created = await page.request.post("/api/crm/contacts", {
      data: { clientId, first_name: unique, company: "Sprint Six", status: "lead" },
    });
    expect(created.status()).toBe(201);
    const contact = await created.json() as { id: string };
    try {
      await page.goto("/dashboard");
      await page.getByRole("button", { name: "Search and jump to a feature" }).click();
      const search = page.getByRole("combobox", { name: "Search RapidTal" });
      await search.fill(unique);
      await expect(page.getByRole("option", { name: new RegExp(unique, "u") })).toBeVisible();
      await page.getByRole("option", { name: new RegExp(unique, "u") }).click();
      await expect(page).toHaveURL(new RegExp(`/crm\\?contact=${contact.id}`, "u"));
      await expect(page.getByRole("dialog", { name: new RegExp(unique, "u") })).toBeVisible();
    } finally {
      await page.request.delete("/api/crm/contacts", { data: { clientId, id: contact.id } });
    }
  });

  test("VA can use global discovery and receives VA-specific in-page help", async ({ page }) => {
    await signIn(page, "VA");
    await page.goto("/lead-generation");
    await page.getByRole("button", { name: "Search and jump to a feature" }).click();
    await page.getByRole("combobox", { name: "Search RapidTal" }).fill("create linkedin post");
    await expect(page.getByRole("option", { name: /Create content/u })).toBeVisible();
    await page.getByRole("button", { name: "Close navigation search" }).click();

    await page.getByRole("button", { name: "Ask Coach about Lead Generation" }).click();
    await expect(page.getByRole("dialog", { name: "Coach for Lead Generation" })).toBeVisible();
    await expect(page.getByRole("button", { name: "What can I do here for the client?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Can my VA help with this?" })).toHaveCount(0);
  });

  test("discovery ignores attempted tenant selection and uses the authenticated tenant", async ({ page }) => {
    const otherClientId = process.env.E2E_OTHER_CLIENT_ID;
    if (!otherClientId) throw new Error("Missing E2E_OTHER_CLIENT_ID.");
    await signIn(page, "CLIENT_ADMIN");
    const response = await page.request.post("/api/discovery/search", {
      data: { q: "company", limit: 8, clientId: otherClientId },
    });
    expect(response.status()).toBe(200);
    const body = await response.json() as { results: Array<{ href: string }> };
    expect(body.results.every((result) => !result.href.includes(otherClientId))).toBe(true);
  });
});
