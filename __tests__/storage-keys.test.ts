import { safeKeyName } from "@/lib/storage-keys";

describe("safeKeyName", () => {
  it("strips the em dash and spaces that broke vault uploads", () => {
    const out = safeKeyName("NRG Services SharePoint — Reference Guide for Emie.docx");
    expect(out).toBe("NRG-Services-SharePoint-Reference-Guide-for-Emie.docx");
    expect(out).toMatch(/^[\w.-]+$/); // only safe characters remain
  });

  it("keeps a clean name unchanged", () => {
    expect(safeKeyName("report_2026.pdf")).toBe("report_2026.pdf");
  });

  it("lowercases and sanitises the extension", () => {
    expect(safeKeyName("Notes.TXT")).toBe("Notes.txt");
  });

  it("handles names with no extension", () => {
    expect(safeKeyName("just a name")).toBe("just-a-name");
  });

  it("collapses repeated separators and trims edges", () => {
    expect(safeKeyName("  ***weird---name***.csv")).toBe("weird-name.csv");
  });

  it("falls back to 'file' when the base sanitises to nothing", () => {
    expect(safeKeyName("———.pdf")).toBe("file.pdf");
  });

  it("only ever returns Supabase-safe characters", () => {
    for (const n of ["café résumé.docx", "“smart” quotes.txt", "a/b\\c:d.pdf", "emoji 🎉 file.png"]) {
      expect(safeKeyName(n)).toMatch(/^[\w.-]+$/);
    }
  });
});
