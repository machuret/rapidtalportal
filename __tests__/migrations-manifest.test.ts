import { readdirSync } from "node:fs";
import { join } from "node:path";
import { MIGRATIONS } from "@/lib/migrations/manifest";

describe("migrations manifest", () => {
  const onDisk = readdirSync(join(process.cwd(), "db", "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  it("exactly matches db/migrations/ (add new migrations to lib/migrations/manifest.ts)", () => {
    expect([...MIGRATIONS]).toEqual(onDisk);
  });

  it("is sorted and unique (filename order = apply order)", () => {
    expect([...MIGRATIONS]).toEqual(Array.from(new Set(MIGRATIONS)).sort());
  });
});
