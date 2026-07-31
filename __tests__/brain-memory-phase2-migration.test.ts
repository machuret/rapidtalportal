import fs from "node:fs";
import path from "node:path";

const sql = fs.readFileSync(
  path.join(process.cwd(), "db/migrations/122_task_aware_brain_memory.sql"),
  "utf8",
);
const leaseSql = fs.readFileSync(
  path.join(process.cwd(), "db/migrations/086_atomic_brain_distillation.sql"),
  "utf8",
);

test("memory vectors and tenant-scoped semantic matching are database enforced", () => {
  expect(sql).toContain("embedding_vector vector(1536)");
  expect(sql).toContain("CREATE OR REPLACE FUNCTION match_brain_memories(");
  expect(sql).toContain("WHERE bm.client_id = p_client_id");
  expect(sql).toContain("bm.status = 'active'");
  expect(sql).toContain("bm.contradiction_status <> 'open'");
  expect(sql).toContain("REVOKE ALL ON FUNCTION match_brain_memories");
  expect(sql).toContain("GRANT EXECUTE ON FUNCTION match_brain_memories");
});

test("exact lineage, proposed-by-default policy and activation guard are enforced", () => {
  expect(sql).toContain("CREATE TABLE IF NOT EXISTS brain_memory_sources");
  expect(sql).toContain("UNIQUE (memory_id, signal_id, contribution)");
  expect(sql).toContain("Memory lineage must stay inside one tenant");
  expect(sql).toContain("Every candidate requires at least one exact supporting signal");
  expect(sql).toContain("CASE WHEN v_conflict_id IS NULL THEN 'proposed' ELSE 'review_required' END");
  expect(sql).toContain("A lesson requires human approval before activation");
  expect(sql).not.toContain("source_count = source_count + 1");
});

test("conflicts and decay have durable database operations", () => {
  expect(sql).toContain("resolve_brain_memory_conflict");
  for (const action of ["keep_existing", "replace_existing", "merge", "narrow", "keep_both"]) {
    expect(sql).toContain(action);
  }
  expect(sql).toContain("CREATE OR REPLACE FUNCTION decay_brain_memories");
  expect(sql).toContain("bm.pinned AND bm.kind = 'rule'");
  expect(sql).toContain("contribution = 'contradict'");
  expect(sql).toContain("content_style_analyses");
  expect(sql).toContain("content_pieces");
  expect(sql).toContain("interval '365 days'");
});

test("distillation still acknowledges exact leased signals only after writes", () => {
  const lineageWrite = sql.indexOf("INSERT INTO brain_memory_sources");
  const acknowledgement = sql.lastIndexOf("UPDATE brain_signals SET");
  expect(lineageWrite).toBeGreaterThan(-1);
  expect(acknowledgement).toBeGreaterThan(lineageWrite);
  expect(sql).toContain("distill_claim_token = p_claim_token");
  expect(leaseSql).toContain("FOR UPDATE SKIP LOCKED");
});
