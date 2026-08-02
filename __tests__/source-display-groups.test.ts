/** @jest-environment node */

import { groupSourcesForDisplay } from "@/lib/source-display-groups";

type Source = { id: string; kind: string; title: string; url?: string; excerpt?: string };

const options = {
  namespace: (source: Source) => source.kind,
  identity: (source: Source) => source.id,
  title: (source: Source) => source.title,
  url: (source: Source) => source.url,
  excerpt: (source: Source) => source.excerpt,
};

describe("groupSourcesForDisplay", () => {
  test("groups chunks, canonical URLs and duplicate crawl pages without losing lineage", () => {
    const sources: Source[] = [
      { id: "dossier", kind: "vault", title: "Company Dossier", excerpt: "First passage" },
      { id: "dossier", kind: "vault", title: "Company Dossier", excerpt: "Second passage" },
      { id: "sales-1", kind: "vault", title: "Auction Sales Results & Sold Prices", url: "https://example.com/results?a=1", excerpt: "Sale prices for yearlings and mares" },
      { id: "sales-2", kind: "vault", title: "Auction Sales Results & Sold Prices", url: "https://example.com/results?a=2", excerpt: "Sale prices for other yearlings" },
    ];

    const groups = groupSourcesForDisplay(sources, options);
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.count)).toEqual([2, 2]);
    expect(groups.flatMap((group) => group.sources)).toEqual(sources);
  });

  test("does not merge the same title across evidence namespaces", () => {
    const groups = groupSourcesForDisplay([
      { id: "vault-1", kind: "vault", title: "Growth Playbook" },
      { id: "library-1", kind: "library", title: "Growth Playbook" },
    ], options);
    expect(groups).toHaveLength(2);
  });
});
