import { dedupeAttentionItems } from "@/lib/dashboard/attention";

describe("client attention feed", () => {
  it("collapses identical operational alerts and discloses the affected count", () => {
    const result = dedupeAttentionItems([
      {
        id: "lead:one",
        title: "Lead collection needs attention",
        detail: "Lead collection is not configured correctly.",
        href: "/lead-generation",
        severity: "warning",
      },
      {
        id: "lead:two",
        title: "Lead collection needs attention",
        detail: "Lead collection is not configured correctly.",
        href: "/lead-generation",
        severity: "warning",
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "lead:one",
      detail: "2 affected · Lead collection is not configured correctly.",
    });
  });

  it("keeps alerts separate when they require different actions", () => {
    const result = dedupeAttentionItems([
      { id: "vault:one", title: "Source A", detail: "Retry processing", href: "/vault", severity: "warning" },
      { id: "lead:one", title: "Source A", detail: "Retry processing", href: "/lead-generation", severity: "warning" },
    ]);

    expect(result).toHaveLength(2);
  });
});
