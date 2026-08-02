import { parseSopSteps, serializeSteps, type SopStep } from "@/lib/sops/steps";

describe("parseSopSteps", () => {
  it("parses explicit \"Step N:\" blocks, keeping detail lines", () => {
    expect(parseSopSteps("Step 1: Open the CRM\nFilter by status\nStep 2: Export"))
      .toEqual(["Open the CRM\nFilter by status", "Export"]);
  });

  it("parses numbered and bracketed markers", () => {
    expect(parseSopSteps("1. First\n2) Second\n3] Third")).toEqual(["First", "Second", "Third"]);
  });

  it("parses bullet markers", () => {
    expect(parseSopSteps("- Alpha\n* Beta\n• Gamma")).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("falls back to paragraphs when there are no markers", () => {
    expect(parseSopSteps("Do the first thing.\n\nThen the second thing."))
      .toEqual(["Do the first thing.", "Then the second thing."]);
  });

  it("returns a single step for one unmarked block", () => {
    expect(parseSopSteps("Just one instruction")).toEqual(["Just one instruction"]);
  });

  it("ignores blank lines", () => {
    expect(parseSopSteps("Step 1: A\n\n\nStep 2: B")).toEqual(["A", "B"]);
  });
});

describe("serializeSteps", () => {
  const steps: SopStep[] = [
    { title: "Open", detail: "Log in first", tip: "Use SSO" },
    { title: "Close", detail: "" },
  ];

  it("emits intro, prerequisites preamble, and numbered step blocks", () => {
    const body = serializeSteps("Welcome.", ["access granted", " "], steps);
    expect(body).toContain("Welcome.");
    expect(body).toContain("Before you start: access granted");
    expect(body).toContain("Step 1: Open\nLog in first\nTip: Use SSO");
    expect(body).toContain("Step 2: Close");
  });

  it("omits empty intro and prerequisites", () => {
    const body = serializeSteps("", [], [{ title: "Only step", detail: "" }]);
    expect(body).toBe("Step 1: Only step");
  });

  it("round-trips: serialized steps parse back to title+detail (after the preamble)", () => {
    const body = serializeSteps("Intro", ["prep"], steps);
    const parsed = parseSopSteps(body);
    expect(parsed[0]).toContain("Intro");              // intro + prereqs become the preamble block
    expect(parsed[1]).toBe("Open\nLog in first\nTip: Use SSO");
    expect(parsed[2]).toBe("Close");
  });
});
