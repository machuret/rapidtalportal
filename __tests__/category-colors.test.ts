import { categoryColor, CATEGORY_COLORS, CATEGORY_COLOR_KEYS } from "@/lib/tasks/category-colors";

describe("categoryColor", () => {
  it("returns the matching palette entry for a known key", () => {
    expect(categoryColor("blue")).toBe(CATEGORY_COLORS.blue);
  });

  it("falls back to zinc for an unknown or stale key", () => {
    expect(categoryColor("chartreuse")).toBe(CATEGORY_COLORS.zinc);
    expect(categoryColor("")).toBe(CATEGORY_COLORS.zinc);
  });

  it("exposes every palette key, all with chip/dot/swatch classes", () => {
    expect(CATEGORY_COLOR_KEYS.length).toBeGreaterThan(0);
    for (const key of CATEGORY_COLOR_KEYS) {
      const c = CATEGORY_COLORS[key];
      expect(c.chip).toBeTruthy();
      expect(c.dot).toBeTruthy();
      expect(c.swatch).toBeTruthy();
    }
  });
});
