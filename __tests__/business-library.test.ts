import {
  businessLibraryCreateSchema,
  businessLibraryTransitionSchema,
  businessLibraryUpdateSchema,
  businessLibraryValidationMessage,
  isLibraryReviewDue,
  slugifyLibraryTitle,
} from "@/lib/business-library";

const validInput = {
  categoryId: "2aa7ca90-af7e-4ee1-84d4-f8fa01a39df6",
  title: "Local SEO foundation",
  summary: "A practical foundation for improving local search visibility.",
  body: "Start with a complete business profile, consistent company details and a clear service-area strategy. Measure discovery and conversion actions.",
  sourceUrl: "https://example.com/local-seo",
  tags: ["SEO", "local search"],
  industries: [],
  countries: ["Australia"],
  audiences: ["local customers"],
  lifecycleStages: ["growth"],
  channels: ["website", "Google"],
  timeSensitive: true,
  validFrom: "2026-01-01",
  validUntil: "2027-01-01",
  reviewDueAt: "2026-12-01T00:00:00.000Z",
  changeNote: "Initial reviewed release.",
};

describe("Business Library contracts", () => {
  it("creates stable URL-safe slugs", () => {
    expect(slugifyLibraryTitle("  Café SEO & Meta Ads  ")).toBe("cafe-seo-meta-ads");
  });

  it("accepts complete governed guidance", () => {
    expect(businessLibraryCreateSchema.safeParse({
      ...validInput,
      slug: "local-seo-foundation",
    }).success).toBe(true);
  });

  it("normalises a bare source domain and surrounding whitespace", () => {
    const result = businessLibraryCreateSchema.safeParse({
      ...validInput,
      slug: "local-seo-foundation",
      sourceUrl: "  www.example.com/local-seo  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sourceUrl).toBe("https://www.example.com/local-seo");
    }
  });

  it("returns a field-specific message for a malformed source URL", () => {
    const result = businessLibraryCreateSchema.safeParse({
      ...validInput,
      slug: "local-seo-foundation",
      sourceUrl: "not a valid URL",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(businessLibraryValidationMessage(result.error)).toBe(
        "Source URL: Enter a valid source URL, for example https://example.com.",
      );
    }
  });

  it("accepts a date-only review boundary and normalises it to UTC", () => {
    const result = businessLibraryCreateSchema.safeParse({
      ...validInput,
      slug: "local-seo-foundation",
      reviewDueAt: "2026-12-01",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reviewDueAt).toBe("2026-12-01T00:00:00.000Z");
    }
  });

  it("rejects non-web source protocols", () => {
    const result = businessLibraryCreateSchema.safeParse({
      ...validInput,
      slug: "local-seo-foundation",
      sourceUrl: "javascript:alert(1)",
    });
    expect(result.success).toBe(false);
  });

  it("requires a freshness boundary for time-sensitive guidance", () => {
    const result = businessLibraryCreateSchema.safeParse({
      ...validInput,
      slug: "local-seo-foundation",
      validUntil: "",
      reviewDueAt: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects reversed validity windows", () => {
    const result = businessLibraryCreateSchema.safeParse({
      ...validInput,
      slug: "local-seo-foundation",
      validFrom: "2027-01-01",
      validUntil: "2026-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("only updates a named draft version", () => {
    expect(businessLibraryUpdateSchema.safeParse({
      ...validInput,
      versionId: "e044ed92-7ed6-4337-b60f-d21aa8ca67cf",
    }).success).toBe(true);
  });

  it("requires a version for lifecycle actions except new-version creation", () => {
    expect(businessLibraryTransitionSchema.safeParse({
      action: "publish",
      versionId: null,
    }).success).toBe(false);
    expect(businessLibraryTransitionSchema.safeParse({
      action: "new_version",
      versionId: null,
    }).success).toBe(true);
  });

  it("identifies overdue published guidance without flagging drafts", () => {
    const now = new Date("2026-07-31T00:00:00.000Z");
    expect(isLibraryReviewDue({
      status: "published",
      reviewDueAt: "2026-07-01T00:00:00.000Z",
    }, now)).toBe(true);
    expect(isLibraryReviewDue({
      status: "draft",
      reviewDueAt: "2026-07-01T00:00:00.000Z",
    }, now)).toBe(false);
  });
});
