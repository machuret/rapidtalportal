import { expect, test, type Page } from "@playwright/test";

interface RoleCredentials {
  email: string;
  password: string;
}

function credentials(prefix: "ADMIN" | "CLIENT_ADMIN" | "VA"): RoleCredentials {
  const email = process.env[`E2E_${prefix}_EMAIL`];
  const password = process.env[`E2E_${prefix}_PASSWORD`];
  if (!email || !password) {
    throw new Error(`Missing signed-in browser credentials for ${prefix}.`);
  }
  return { email, password };
}

async function signIn(page: Page, role: "ADMIN" | "CLIENT_ADMIN" | "VA") {
  const account = credentials(role);
  await page.goto("/login");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.endsWith("/login")),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

test.describe("signed-in Content Studio roles", () => {
  test("super admin reaches the protected client administration workspace", async ({ page }) => {
    await signIn(page, "ADMIN");
    await page.goto("/admin/clients");
    await expect(page.getByRole("heading", { name: "Clients", exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/clients$/u);
  });

  test("client admin can manage competitors and start intelligence", async ({ page }) => {
    await signIn(page, "CLIENT_ADMIN");
    await page.goto("/content");
    await expect(page.getByRole("heading", { name: "Content Studio" })).toBeVisible();
    await page.getByRole("button", { name: /Competitor opportunities/u }).click();
    await expect(page.getByRole("heading", { name: "Competitor intelligence" })).toBeVisible();
    await expect(page.getByTestId("competitor-add-button")).toBeVisible();

    await expect(page.getByTestId("competitor-analyse-button")).toBeVisible();
  });

  test("VA can read Market Intelligence but cannot mutate competitor configuration", async ({ page }) => {
    await signIn(page, "VA");
    await page.goto("/content");
    await expect(page.getByRole("heading", { name: "Content Studio" })).toBeVisible();
    await page.getByRole("button", { name: /Competitor opportunities/u }).click();
    await expect(page.getByRole("heading", { name: "Competitor intelligence" })).toBeVisible();
    await expect(page.getByTestId("competitor-add-button")).toHaveCount(0);
    await expect(page.getByTestId("competitor-analyse-button")).toHaveCount(0);
  });

  test("client admin session cannot read another tenant's intelligence API", async ({ page }) => {
    const ownClientId = process.env.E2E_CLIENT_ADMIN_CLIENT_ID;
    const otherClientId = process.env.E2E_OTHER_CLIENT_ID;
    if (!ownClientId || !otherClientId) {
      throw new Error("Missing E2E client IDs for the signed-in tenant-boundary test.");
    }
    await signIn(page, "CLIENT_ADMIN");

    const own = await page.request.get(
      `/api/content/competitors/intelligence?client_id=${ownClientId}`,
    );
    expect(own.status()).toBe(200);

    const other = await page.request.get(
      `/api/content/competitors/intelligence?client_id=${otherClientId}`,
    );
    expect(other.status()).toBe(403);
  });

  test("client admin can recover a saved editorial project after leaving the workflow", async ({ page }) => {
    await signIn(page, "CLIENT_ADMIN");
    await page.goto("/content");
    const title = `E2E recoverable idea ${Date.now()}`;

    await page.getByRole("button", { name: "Start with my own idea" }).click();
    await page.getByPlaceholder("What should the company talk about?").fill(title);
    await page.getByRole("button", { name: "Review idea" }).click();
    await expect(page.getByText("Selected idea")).toBeVisible();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Save idea for later" }).click();
    await expect(page.getByText("Continue working")).toBeVisible();
    await page.reload();
    await page.getByText(title, { exact: true }).first().click();
    await expect(page.getByText("Saved automatically · recoverable on any device")).toBeVisible();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Reject idea" }).click();
    await expect(page.getByText("Idea rejected")).toBeVisible();
  });
});
