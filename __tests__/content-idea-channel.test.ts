import { contentTypeFromGeneratedFormat } from "@/lib/content/idea-channel";

describe("generated idea channel consistency", () => {
  test("corrects an email idea whose format is explicitly a newsletter", () => {
    expect(contentTypeFromGeneratedFormat(
      "email",
      "Monthly newsletter with a founder note and two practical sections",
    )).toBe("newsletter");
  });

  test("keeps the requested channel when the format does not name another channel", () => {
    expect(contentTypeFromGeneratedFormat(
      "email",
      "A concise customer update with one CTA",
    )).toBe("email");
  });

  test("does not guess when a format deliberately mentions multiple channels", () => {
    expect(contentTypeFromGeneratedFormat(
      "linkedin",
      "A LinkedIn post adapted from a blog article",
    )).toBe("linkedin");
  });
});
