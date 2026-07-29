/** @jest-environment node */

import { readFileSync } from "node:fs";
import path from "node:path";

const migration = readFileSync(
  path.resolve(__dirname, "..", "db", "migrations", "101_content_style_analysis.sql"),
  "utf8",
);

describe("content style analysis migration", () => {
  test("keeps analysis records service-role only", () => {
    expect(migration).toContain("ALTER TABLE content_style_analyses ENABLE ROW LEVEL SECURITY");
    expect(migration).toMatch(
      /REVOKE ALL ON TABLE content_style_analyses FROM PUBLIC, anon, authenticated/u,
    );
    expect(migration).toMatch(
      /GRANT ALL ON TABLE content_style_analyses TO service_role/u,
    );
  });

  test("allows only one draft and one approved authority per client and channel", () => {
    expect(migration).toContain("content_style_analyses_one_draft");
    expect(migration).toContain("WHERE status = 'draft'");
    expect(migration).toContain("content_style_analyses_one_approved");
    expect(migration).toContain("WHERE status = 'approved'");
  });

  test("atomically archives the previous authority before approving a draft", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION approve_content_style_analysis");
    expect(migration).toMatch(
      /WHERE id = p_analysis_id[\s\S]+AND client_id = p_client_id[\s\S]+AND status = 'draft'[\s\S]+FOR UPDATE/u,
    );
    expect(migration).toMatch(
      /SET\s+status = 'archived'[\s\S]+WHERE client_id = p_client_id[\s\S]+AND channel = v_target.channel[\s\S]+AND status = 'approved'/u,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION approve_content_style_analysis\(UUID, UUID, UUID\)[\s\S]+FROM PUBLIC, anon, authenticated/u,
    );
  });
});
