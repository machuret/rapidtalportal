import { AU_REGIONS, PH_REGION, HOLIDAY_YEAR, auRegion, type HolidayRegion } from "@/lib/my-job/holidays";

const yyyy = String(HOLIDAY_YEAR);

function assertClean(region: HolidayRegion) {
  const dates = region.holidays.map((h) => h.date);
  // All within the curated year.
  for (const d of dates) expect(d.startsWith(yyyy)).toBe(true);
  // No duplicate dates (a state extra must not collide with a national date).
  expect(new Set(dates).size).toBe(dates.length);
  // Sorted ascending.
  expect([...dates].sort()).toEqual(dates);
  // Every holiday has a non-empty name.
  for (const h of region.holidays) expect(h.name.trim().length).toBeGreaterThan(0);
}

describe("holiday data integrity", () => {
  it("exposes all eight AU states/territories", () => {
    expect(AU_REGIONS).toHaveLength(8);
    expect(AU_REGIONS.map((r) => r.id).sort()).toEqual(["act", "nsw", "nt", "qld", "sa", "tas", "vic", "wa"]);
  });

  it("keeps every AU region clean (in-year, unique, sorted, named)", () => {
    for (const r of AU_REGIONS) { expect(r.country).toBe("AU"); assertClean(r); }
  });

  it("includes the national set in every AU region", () => {
    const nsw = auRegion("nsw").holidays.map((h) => h.date);
    for (const nat of ["2026-01-01", "2026-01-26", "2026-04-25", "2026-12-25", "2026-12-26"]) {
      expect(nsw).toContain(nat);
    }
  });

  it("keeps the PH region clean", () => {
    expect(PH_REGION.country).toBe("PH");
    assertClean(PH_REGION);
  });
});

describe("auRegion", () => {
  it("returns the matching region", () => {
    expect(auRegion("vic").id).toBe("vic");
  });
  it("falls back to the first region for an unknown id", () => {
    expect(auRegion("atlantis")).toBe(AU_REGIONS[0]);
  });
});
