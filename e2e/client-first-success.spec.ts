import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, role: "CLIENT_ADMIN" | "VA" | "SUPER_ADMIN") {
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

test.describe("signed-in client first-success journey", () => {
  test("client sees a recoverable dashboard journey and every focused starter surface", async ({ page }) => {
    const clientId = process.env.E2E_CLIENT_ADMIN_CLIENT_ID;
    const otherClientId = process.env.E2E_OTHER_CLIENT_ID;
    if (!clientId || !otherClientId) throw new Error("Missing E2E client IDs.");
    await signIn(page, "CLIENT_ADMIN");

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /Welcome back/u })).toBeVisible();
    await expect(
      page.getByLabel("Starter journey complete")
        .or(page.getByLabel("Starter progress unavailable"))
        .or(page.getByRole("heading", { name: "Let’s get useful results quickly" })),
    ).toBeVisible();

    await expect(page.getByRole("link", { name: "Home" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Grow" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Company" })).toBeVisible();
    await expect(page.getByText("Company Brain", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Search and jump to a feature" }).click();
    await page.getByRole("textbox", { name: "Search RapidTal" }).fill("google maps");
    await expect(page.getByRole("option", { name: /Find leads/u })).toBeVisible();
    await page.getByRole("button", { name: "Close navigation search" }).click();
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("link", { name: "Create content" })).toBeVisible();
    await expect(page.getByRole("link", { name: "In progress" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Content library" })).toBeVisible();

    await page.goto("/guide");
    await page.getByRole("searchbox", { name: "Search the Guide" }).fill("request work");
    await expect(page.getByRole("button", { name: "Tasks" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Voice" })).toHaveCount(0);

    const ownProgress = await page.request.get(`/api/onboarding/progress?clientId=${clientId}`);
    expect([200, 503]).toContain(ownProgress.status());
    const crossTenant = await page.request.get(`/api/onboarding/progress?clientId=${otherClientId}`);
    expect(crossTenant.status()).toBe(403);
    const crossTenantEvent = await page.request.post("/api/onboarding/events", {
      data: { clientId: otherClientId, step: "company", eventType: "step_viewed", metadata: {} },
    });
    expect(crossTenantEvent.status()).toBe(403);

    await page.goto("/company-dna?setup=company");
    await expect(page.getByText("Step 1 of 6")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Confirm your company" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save and continue" })).toBeVisible();

    await page.goto("/vault?setup=documents");
    await expect(page.getByText("Step 2 of 6")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Add three useful documents" })).toBeVisible();

    await page.goto("/company-dna?setup=voice");
    await expect(page.getByText("Step 3 of 6")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Choose how your content should sound" })).toBeVisible();

    await page.goto("/ask?setup=first-question");
    await expect(page.getByText("Step 4 of 6")).toBeVisible();
    await expect(page.getByPlaceholder("Ask your first question…")).toBeVisible();
    await expect(page.getByRole("button", { name: "Track Goal" })).toHaveCount(0);

    await page.goto("/content/quick?setup=first-draft");
    await expect(page.getByText("Step 5 of 6")).toBeVisible();
    await expect(page.getByLabel("Content topic")).toBeVisible();
    await expect(page.getByLabel("Optional content direction")).toBeVisible();
  });

  test("client navigation search works end-to-end on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, "CLIENT_ADMIN");
    await page.goto("/dashboard");

    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.getByRole("dialog", { name: "Portal navigation" })).toBeVisible();
    await page.getByRole("button", { name: "Search and jump to a feature" }).click();
    const search = page.getByRole("combobox", { name: "Search RapidTal" });
    await search.fill("manage password");
    const delivered = page.waitForResponse((response) => (
      response.url().endsWith("/api/experience/events")
      && response.request().method() === "POST"
      && response.status() === 204
    ));
    await search.press("Enter");

    await expect(page).toHaveURL(/\/access$/u);
    await expect(page.getByRole("dialog", { name: "Portal navigation" })).toHaveCount(0);
    const delivery = await delivered;
    const body = delivery.request().postDataJSON() as { events?: Array<Record<string, unknown>> };
    expect(JSON.stringify(body)).not.toContain("manage password");
    expect(body.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        eventType: "navigation_destination_opened",
        targetPath: "/access",
        interactionId: expect.any(String),
      }),
    ]));
  });

  test("VA cannot opt into client-only starter modes by editing the URL", async ({ page }) => {
    await signIn(page, "VA");

    // Sprint 6 discovery is a shared client/VA capability even though starter
    // setup remains client-admin only.
    await expect(page.getByRole("button", { name: "Search and jump to a feature" })).toBeVisible();

    await page.goto("/ask?setup=first-question");
    await expect(page.getByText("Step 4 of 6")).toHaveCount(0);
    await expect(page.getByText("What is RapidTal Coach?")).toBeVisible();

    await page.goto("/vault?setup=documents");
    await expect(page.getByText("Step 2 of 6")).toHaveCount(0);
    await expect(page.getByText("What is the Vault?")).toBeVisible();
  });

  test("super admin can inspect the real cohort and role-segmented adoption report", async ({ page }) => {
    test.skip(
      !process.env.E2E_SUPER_ADMIN_EMAIL || !process.env.E2E_SUPER_ADMIN_PASSWORD,
      "Missing signed-in browser credentials for SUPER_ADMIN.",
    );
    await signIn(page, "SUPER_ADMIN");
    await page.goto("/admin/health?range=7");
    await expect(page.getByText("Client adoption — last 7 days")).toBeVisible();
    await expect(page.getByText("Adoption reporting is unavailable")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Adoption reporting period" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Lifetime progress" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Loaded" })).toBeVisible();
  });
});
