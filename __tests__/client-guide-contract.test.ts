/** @jest-environment node */

import { existsSync, readFileSync } from "fs";
import path from "path";
import { CLIENT_GUIDE } from "@/lib/client-guide";
import { CLIENT_TERMS } from "@/lib/client-experience";
import { PAGE_INTROS } from "@/lib/page-intros";

const root = path.resolve(__dirname, "..");
const items = CLIENT_GUIDE.flatMap((group) => group.items);

describe("client Guide and language contract", () => {
  test("every built-in client Guide item opens a real portal route", () => {
    for (const item of items) {
      expect(item.href).toBeTruthy();
      const route = item.href === "/" ? "" : item.href;
      expect(existsSync(path.join(root, "app/(portal)", route!, "page.tsx"))).toBe(true);
    }
  });

  test("the Guide does not send clients to retired top-level features", () => {
    const titles = items.map((item) => item.title);
    expect(titles).not.toContain("Supervision");
    expect(titles).not.toContain("Brain Analytics");
    expect(titles).not.toContain("New features & Tools in development");
    expect(JSON.stringify(CLIENT_GUIDE)).not.toMatch(/built only from your own documents|only uses your real documents/);
  });

  test("client page help links target a current Guide section", () => {
    const titles = new Set(items.map((item) => item.title));
    const clientIntroIds = [
      "vault", "ask", "tasks", "access", "crm", "lead-generation", "company-dna",
      "brain-analytics", "messages", "notebook", "content-quick", "content-ideas",
      "content-competitors", "content-projects", "content-library", "content-style", "dna-competitors",
    ];
    for (const id of clientIntroIds) {
      const guide = PAGE_INTROS[id]?.guide;
      expect(guide && titles.has(guide)).toBe(true);
    }
  });

  test("canonical client terms remain plain and stable", () => {
    expect(CLIENT_TERMS).toEqual({
      companyProfile: "Company profile",
      companyKnowledge: "Company knowledge",
      companySource: "Company source",
      writingExample: "Writing example",
      learnedPreference: "Learned preference",
      contentInProgress: "In-progress content",
      draft: "Draft",
      competitorContent: "Collected competitor content",
    });
  });

  test("experience storage is service-only and tenant-attributed", () => {
    const migration = readFileSync(path.join(root, "db/migrations/20260803000400_client_experience_sprint1.sql"), "utf8");
    expect(migration).toContain("client_id UUID NOT NULL REFERENCES clients");
    expect(migration).toContain("user_id UUID NOT NULL REFERENCES users");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON TABLE portal_experience_events FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("GRANT SELECT, INSERT, DELETE ON TABLE portal_experience_events TO service_role");
  });
});
