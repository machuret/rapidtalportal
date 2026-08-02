/** @jest-environment node */

import { readFileSync } from "fs";
import path from "path";

const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("admin Vault failure handling", () => {
  test("failed reads are not presented as empty Vault states", () => {
    const page = read("app/(portal)/admin/vault/page.tsx");
    const list = read("components/vault/VaultClient.tsx");
    const recap = read("components/vault/VaultRecap.tsx");
    const expanded = read("components/vault/VaultExpanded.tsx");
    const golden = read("components/vault/GoldenQuestions.tsx");

    expect(page).toContain("clientsError");
    expect(page).toContain("dnaError");
    expect(list).toContain("vaultLoadFailed");
    expect(list).toContain("This client&apos;s Vault could not be loaded.");
    expect(recap).toContain("loadError");
    expect(expanded).toContain("loadError");
    expect(golden).toContain("loadError");
  });

  test("crawl progress exposes repeated polling failures and supports retry", () => {
    const panel = read("components/vault/CrawlJobPanel.tsx");
    expect(panel).toContain("consecutiveFailures");
    expect(panel).toContain("Retry now");
    expect(panel).toContain("Progress could not be refreshed after three attempts.");
  });

  test("crawl checkpoints cannot skip database write failures", () => {
    const route = read("app/api/vault/crawl-site/advance/route.ts");
    expect(route).toContain("if (existingError) throw existingError");
    expect(route).toContain("if (insertError) throw insertError");
    expect(route).toContain("if (catalogError) throw catalogError");
    expect(route).toContain("if (itemsError) throw itemsError");
    expect(route).toContain("if (sourceError) throw sourceError");
    expect(route).toContain("if (dossierError) throw dossierError");
  });

  test("URL and file processing failures are returned instead of false success", () => {
    const url = read("app/api/vault/url/route.ts");
    const upload = read("app/api/vault/upload/route.ts");
    expect(url).toContain("The URL was saved, but the page could not be processed");
    expect(url).toContain("website crawling is not configured");
    expect(upload).toContain("The file was uploaded, but its contents could not be processed");
  });

  test("bulk indexing runs server-side and reports unfinished items truthfully", () => {
    const list = read("components/vault/VaultClient.tsx");
    const route = read("app/api/vault/index-batch/route.ts");
    // One server-side sweep — no per-item browser loop that dies on navigation.
    expect(list).toContain("ROUTES.vault.indexBatch()");
    expect(list).not.toContain("succeeded++");
    // Items still unindexed after the sweep are surfaced, not hidden.
    expect(route).toContain("remaining");
    expect(list).toContain("The background indexer finishes the rest automatically.");
  });
});
