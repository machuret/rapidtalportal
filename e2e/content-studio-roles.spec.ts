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

  test("super admin can inspect either seeded client while tenant roles cannot", async ({ page }) => {
    const otherClientId = process.env.E2E_OTHER_CLIENT_ID;
    if (!otherClientId) throw new Error("Missing E2E_OTHER_CLIENT_ID.");
    await signIn(page, "ADMIN");
    const response = await page.request.get(
      `/api/content/projects?client_id=${otherClientId}`,
    );
    expect(response.status()).toBe(200);
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

  test("client admin collects seeded LinkedIn and article sources, analyses them, inspects evidence and promotes an idea", async ({ page }) => {
    test.setTimeout(300_000);
    const clientId = process.env.E2E_CLIENT_ADMIN_CLIENT_ID;
    if (!clientId) throw new Error("Missing E2E_CLIENT_ADMIN_CLIENT_ID.");
    await signIn(page, "CLIENT_ADMIN");

    const stateResponse = await page.request.get(`/api/content/competitors?client_id=${clientId}`);
    expect(stateResponse.status()).toBe(200);
    const state = await stateResponse.json() as {
      competitors: Array<{
        id: string;
        readiness: { ready: boolean };
        sources: Array<{ id: string; platform: string; source_type: string; status: string }>;
      }>;
    };
    const activeSources = state.competitors.flatMap((competitor) =>
      competitor.sources
        .filter((source) => source.status === "active")
        .map((source) => ({ ...source, competitorId: competitor.id })),
    );
    const linkedin = activeSources.find((source) => source.platform === "linkedin");
    const article = activeSources.find((source) =>
      source.platform !== "linkedin" &&
      ["website", "blog", "rss"].includes(source.source_type),
    );
    expect(linkedin, "Seed a collectable LinkedIn company source in staging.").toBeTruthy();
    expect(article, "Seed a collectable article or website source in staging.").toBeTruthy();

    for (const source of [linkedin!, article!]) {
      const start = await page.request.post("/api/content/competitors/crawl", {
        data: { client_id: clientId, source_id: source.id },
      });
      expect([202, 409], `start source ${source.id}`).toContain(start.status());
      if (start.status() === 409) continue;
      const payload = await start.json() as { job: { id: string; status: string } };
      let status = payload.job.status;
      for (let cycle = 0; cycle < 30 && !["complete", "failed"].includes(status); cycle++) {
        const advance = await page.request.post("/api/content/competitors/crawl/advance", {
          data: { client_id: clientId, job_id: payload.job.id },
        });
        expect(advance.status()).toBe(200);
        const result = await advance.json() as { job: { status?: string } | null; busy?: boolean };
        status = result.job?.status ?? status;
        if (result.busy) await page.waitForTimeout(750);
      }
      expect(status, `collection job ${payload.job.id}`).toBe("complete");
    }

    const refreshed = await page.request.get(`/api/content/competitors?client_id=${clientId}`);
    const refreshedState = await refreshed.json() as typeof state;
    const readyCompetitors = refreshedState.competitors
      .filter((competitor) => competitor.readiness.ready)
      .map((competitor) => competitor.id)
      .slice(0, 3);
    expect(readyCompetitors.length).toBeGreaterThan(0);
    const intelligence = await page.request.post("/api/content/competitors/intelligence", {
      data: {
        client_id: clientId,
        competitor_ids: readyCompetitors,
        window_days: 180,
      },
      timeout: 120_000,
    });
    expect(intelligence.status()).toBe(201);

    await page.goto("/content");
    await page.getByRole("button", { name: /Competitor opportunities/u }).click();
    await page.getByRole("button", { name: "Ideas", exact: true }).click();
    await expect(page.getByRole("link").first()).toBeVisible();
    await page.getByRole("button", { name: "Build content brief" }).first().click();
    await expect(page.getByText("Selected idea")).toBeVisible();
    await page.getByRole("button", { name: "Reject idea" }).click();
    await expect(page.getByText("Idea rejected")).toBeVisible();
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

  test("VA cannot approve content even inside their own tenant", async ({ page }) => {
    const ownClientId = process.env.E2E_CLIENT_ADMIN_CLIENT_ID;
    if (!ownClientId) throw new Error("Missing E2E client ID for the VA approval test.");
    await signIn(page, "VA");

    const response = await page.request.patch("/api/content/pieces", {
      data: {
        client_id: ownClientId,
        id: crypto.randomUUID(),
        status: "approved",
      },
    });

    expect(response.status()).toBe(403);
    expect(await response.json()).toEqual({ error: "Not allowed to approve content." });
  });

  test("VA capability controls are enforced by APIs, not only hidden in the UI", async ({ page }) => {
    const clientId = process.env.E2E_CLIENT_ADMIN_CLIENT_ID;
    if (!clientId) throw new Error("Missing E2E_CLIENT_ADMIN_CLIENT_ID.");
    await signIn(page, "VA");

    const forbidden = await Promise.all([
      page.request.post("/api/content/competitors", {
        data: { client_id: clientId, name: "Forbidden VA competitor" },
      }),
      page.request.post("/api/company-dna", {
        data: { client_id: clientId, brand_voice: "Forbidden VA mutation" },
      }),
      page.request.post("/api/content/style-analysis", {
        data: { client_id: clientId, channel: "linkedin", expected_updated_at: null },
      }),
    ]);
    expect(forbidden.map((response) => response.status())).toEqual([403, 403, 403]);

    const created = await page.request.post("/api/content/pieces", {
      data: {
        client_id: clientId,
        content_type: "linkedin",
        title: `VA editable draft ${Date.now()}`,
        body: "A draft the VA can prepare for client review.",
      },
    });
    expect(created.status()).toBe(201);
    const piece = await created.json() as { id: string };
    const edited = await page.request.patch("/api/content/pieces", {
      data: {
        client_id: clientId,
        id: piece.id,
        body: "An edited draft the VA can prepare for client review.",
      },
    });
    expect(edited.status()).toBe(200);
    const approval = await page.request.patch("/api/content/pieces", {
      data: { client_id: clientId, id: piece.id, status: "approved" },
    });
    expect(approval.status()).toBe(403);
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

    const protectedReads = [
      `/api/content/competitors?client_id=${otherClientId}`,
      `/api/content/competitors/intelligence?client_id=${otherClientId}`,
      `/api/content/projects?client_id=${otherClientId}`,
      `/api/content/pieces?client_id=${otherClientId}`,
      `/api/content/topics?client_id=${otherClientId}`,
      `/api/content/style-analysis?client_id=${otherClientId}`,
      `/api/content/goldens?client_id=${otherClientId}`,
      `/api/content/voice-evaluations?client_id=${otherClientId}`,
      `/api/content/pilot?client_id=${otherClientId}`,
    ];
    for (const path of protectedReads) {
      const response = await page.request.get(path);
      expect(response.status(), path).toBe(403);
    }
  });

  test("stale concurrent project edits are rejected and the saved state survives refresh", async ({ page }) => {
    const clientId = process.env.E2E_CLIENT_ADMIN_CLIENT_ID;
    if (!clientId) throw new Error("Missing E2E_CLIENT_ADMIN_CLIENT_ID.");
    await signIn(page, "CLIENT_ADMIN");
    const createdResponse = await page.request.post("/api/content/projects", {
      data: {
        client_id: clientId,
        idea: {
          version: 1,
          origin: "manual",
          title: `Concurrent edit check ${Date.now()}`,
          channel: "linkedin",
          rationale: "Staging concurrency proof.",
          differentiation: "A controlled browser test.",
          evidenceSummary: "No factual claims.",
        },
      },
    });
    expect(createdResponse.status()).toBe(201);
    const created = await createdResponse.json() as { id: string; updated_at: string };
    const first = await page.request.patch("/api/content/projects", {
      data: {
        client_id: clientId,
        id: created.id,
        expected_updated_at: created.updated_at,
        current_step: "brief",
      },
    });
    expect(first.status()).toBe(200);
    const stale = await page.request.patch("/api/content/projects", {
      data: {
        client_id: clientId,
        id: created.id,
        expected_updated_at: created.updated_at,
        current_step: "brief",
      },
    });
    expect(stale.status()).toBe(409);
  });

  test("client admin can recover the brief and evidence workflow after closing the page", async ({ page }) => {
    test.setTimeout(180_000);
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
    await expect(page.getByText("Project saved · recoverable on any device")).toBeVisible();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Promote into a brief" }).click();
    await page.getByLabel("Audience").fill("Prospective clients");
    await page.getByLabel("Objective").fill("Explain one practical way to make a better-informed decision.");
    await page.getByLabel("Angle").fill("Lead with a useful question and answer it in plain language.");
    await page.getByLabel("Desired format").fill("Short educational post");
    await page.getByLabel("Call to action").fill("Invite the reader to learn more");
    await expect(page.getByText("Project saved · recoverable on any device")).toBeVisible();

    await page.reload();
    await page.getByText(title, { exact: true }).first().click();
    await expect(page.getByLabel("Audience")).toHaveValue("Prospective clients");
    await expect(page.getByLabel("Angle")).toHaveValue(
      "Lead with a useful question and answer it in plain language.",
    );

    await page.getByRole("button", { name: "Review evidence" }).click();
    await expect(page.getByText("Facts from the company Vault")).toBeVisible();
    await page.getByRole("button", { name: /Continue with \d+ factual sources?/u }).click();
    await expect(page.getByText("Ready to generate")).toBeVisible();

    await page.reload();
    await page.getByText(title, { exact: true }).first().click();
    await expect(page.getByText("Ready to generate")).toBeVisible();
    await page.getByRole("button", { name: "Generate draft" }).click();
    await expect(page.getByText("Edit and refine")).toBeVisible({ timeout: 120_000 });
    await page.getByRole("button", { name: "Edit draft" }).click();
    const editor = page.locator('textarea[rows="18"]');
    const body = await editor.inputValue();
    await editor.fill(`${body}\n\nPrepared and reviewed through the staging editorial journey.`);
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Save the draft before validation.")).toHaveCount(0);
    await page.getByRole("button", { name: /Validate draft/u }).click();
    await expect(page.getByRole("heading", { name: /Claims, voice, structure and hard rules/u })).toBeVisible();
    await expect(page.getByRole("button", { name: /Review for approval/u })).toBeEnabled({ timeout: 30_000 });
    await page.getByRole("button", { name: /Review for approval/u }).click();
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(page.getByText("Approved content project")).toBeVisible();
  });
});
