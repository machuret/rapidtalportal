import { placementTemplates, type TemplatePage } from "@/lib/notebook/templates";

const isDoc = (c: unknown): boolean =>
  !!c && typeof c === "object" && (c as { type?: string }).type === "doc" && Array.isArray((c as { content?: unknown }).content);

describe("placementTemplates", () => {
  const tpls = placementTemplates();

  it("seeds the six expected pages", () => {
    expect(tpls.map((t) => t.title)).toEqual([
      "Onboarding Checklist",
      "SOPs",
      "Access & Accounts Register",
      "Weekly Report",
      "Content Calendar",
      "Meeting Notes",
    ]);
  });

  it("only the SOPs and Meeting Notes parents have a single child (depth-1 max)", () => {
    const withKids = tpls.filter((t) => t.children?.length);
    expect(withKids.map((t) => t.title)).toEqual(["SOPs", "Meeting Notes"]);
    for (const t of withKids) {
      expect(t.children).toHaveLength(1);
      // children must be leaves — no second level of nesting
      for (const c of t.children!) expect((c as TemplatePage).children).toBeUndefined();
    }
  });

  it("every page (and child) is a valid TipTap doc", () => {
    const all: TemplatePage[] = [...tpls, ...tpls.flatMap((t) => t.children ?? [])];
    for (const p of all) expect(isDoc(p.content)).toBe(true);
  });

  it("the Access register warns against storing passwords", () => {
    const reg = tpls.find((t) => t.title === "Access & Accounts Register")!;
    expect(JSON.stringify(reg.content).toLowerCase()).toContain("never store passwords");
  });
});
