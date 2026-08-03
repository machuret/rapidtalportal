import { expect, test, type Page } from "@playwright/test";

async function signInClient(page: Page) {
  const email = process.env.E2E_CLIENT_ADMIN_EMAIL;
  const password = process.env.E2E_CLIENT_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Missing signed-in browser credentials for CLIENT_ADMIN.");
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.endsWith("/login")),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

test.describe("client loading recovery", () => {
  test("critical client routes become usable and emit actual feature readiness", async ({ page }) => {
    test.setTimeout(120_000);
    await signInClient(page);
    const readiness: Array<{ path?: string; eventType?: string }> = [];
    page.on("request", (request) => {
      if (!request.url().endsWith("/api/experience/events") || request.method() !== "POST") return;
      try { readiness.push(request.postDataJSON() as { path?: string; eventType?: string }); } catch { /* ignore */ }
    });

    for (const route of ["/dashboard", "/team", "/reports", "/crm", "/vault"] as const) {
      await page.goto(route);
      await expect(page.locator("main")).not.toBeEmpty({ timeout: 20_000 });
      await expect.poll(
        () => readiness.some((event) => event.path === route && event.eventType === "feature_ready"),
        { timeout: 20_000, message: `${route} did not report feature readiness` },
      ).toBe(true);
    }
  });

  test("Lead Generation turns a failed initial read into a working inline retry", async ({ page }) => {
    await signInClient(page);
    let failCampaignsOnce = true;
    await page.route("**/api/prospecting/campaigns**", async (route) => {
      if (failCampaignsOnce) {
        failCampaignsOnce = false;
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Injected loading failure" }) });
        return;
      }
      await route.continue();
    });

    await page.goto("/lead-generation");
    await page.getByRole("tab", { name: "Campaigns" }).click();
    await expect(page.getByText("Campaigns could not be loaded", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText("Campaigns could not be loaded", { exact: true })).toBeHidden({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Campaigns", exact: true })).toBeVisible();
  });
});
