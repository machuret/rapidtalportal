import { salvageJson } from "@/lib/tools/json-salvage";

describe("salvageJson", () => {
  it("recovers complete elements from a truncated array of objects", () => {
    // Outer object with a "days" array truncated mid-object.
    const truncated = '{"days":[{"day":1,"idea":"a"},{"day":2,"idea":"b"},{"day":3,"id';
    const fixed = salvageJson(truncated);
    expect(fixed).not.toBeNull();
    const parsed = JSON.parse(fixed!);
    expect(parsed.days).toHaveLength(2);
    expect(parsed.days[1]).toEqual({ day: 2, idea: "b" });
  });

  it("closes a truncated top-level array, keeping whole items", () => {
    const truncated = '[{"hook":"one"},{"hook":"two"},{"hoo';
    const parsed = JSON.parse(salvageJson(truncated)!);
    expect(parsed).toHaveLength(2);
    expect(parsed[1]).toEqual({ hook: "two" });
  });

  it("recovers earlier string fields when a later one is cut off", () => {
    // repurposer shape: linkedin done, facebook truncated mid-string.
    const truncated = '{"linkedin":"done","facebook":"half wri';
    const parsed = JSON.parse(salvageJson(truncated)!);
    expect(parsed.linkedin).toBe("done");
    expect(parsed.facebook).toBeUndefined();
  });

  it("does not mangle a comma or quote inside a string value", () => {
    const truncated = '{"a":"x, y, z","b":[1,2],"c":"cut';
    const parsed = JSON.parse(salvageJson(truncated)!);
    expect(parsed.a).toBe("x, y, z");
    expect(parsed.b).toEqual([1, 2]);
    expect(parsed.c).toBeUndefined();
  });

  it("handles escaped quotes inside strings", () => {
    const truncated = '{"a":"she said \\"hi\\"","b":"cut off her';
    const parsed = JSON.parse(salvageJson(truncated)!);
    expect(parsed.a).toBe('she said "hi"');
  });

  it("returns null when nothing complete exists yet", () => {
    expect(salvageJson('{"days":[{"day":1')).toBeNull();
    expect(salvageJson('{"a":"unterminated')).toBeNull();
  });

  it("leaves already-valid JSON parseable", () => {
    const valid = '{"days":[{"day":1}],"caption":"hi"}';
    const parsed = JSON.parse(salvageJson(valid)!);
    expect(parsed).toEqual({ days: [{ day: 1 }], caption: "hi" });
  });
});
