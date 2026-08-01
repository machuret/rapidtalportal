import { brainContextSchema } from "@/lib/brain/context-contract";
import {
  renderBrainContext,
  resolveBrainContext,
} from "@/supabase/functions/_shared/brain-context";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const VAULT_ID = "22222222-2222-4222-8222-222222222222";
const CHUNK_ID = "33333333-3333-4333-8333-333333333333";
const MEMORY_ID = "44444444-4444-4444-8444-444444444444";
const STYLE_ID = "55555555-5555-4555-8555-555555555555";
const LIBRARY_ENTRY_ID = "66666666-6666-4666-8666-666666666666";
const LIBRARY_VERSION_ID = "77777777-7777-4777-8777-777777777777";
const LIBRARY_CHUNK_ID = "88888888-8888-4888-8888-888888888888";

class FakeQuery {
  constructor(
    private readonly rows: unknown[],
    private readonly singleRow: unknown = rows[0] ?? null,
    private readonly error: { message: string } | null = null,
  ) {}
  select() { return this; }
  eq() { return this; }
  is() { return this; }
  or() { return this; }
  in() { return this; }
  order() { return this; }
  contains() { return this; }
  limit() { return this; }
  maybeSingle() {
    return Promise.resolve({ data: this.singleRow, error: this.error });
  }
  then(resolve: (value: { data: unknown[]; error: { message: string } | null }) => unknown) {
    return Promise.resolve({ data: this.rows, error: this.error }).then(resolve);
  }
}

function fakeAdmin(options: {
  librarySearchFails?: boolean;
  libraryRecoveryFails?: boolean;
  libraryCurrentVersionId?: string;
} = {}) {
  const fixtures: Record<string, unknown[]> = {
    company_dna: [{
      company_name: "Example Co",
      company_description: "Commercial finance specialists.",
      brand_voice: "Direct and practical.",
      channel_styles: { linkedin: "Short paragraphs and a clear discussion question." },
      hard_rules: [{
        id: "no-hype",
        type: "prohibit_phrase",
        value: "game changer",
        channels: ["linkedin"],
      }],
      extra: {},
      updated_at: "2026-07-31T00:00:00.000Z",
    }],
    content_style_analyses: [{
      id: STYLE_ID,
      channel: "linkedin",
      status: "approved",
      version: 2,
      analysis: {
        schema_version: 1,
        summary: "Evidence-led and conversational.",
        confidence: "high",
      },
      source_item_ids: [],
      source_evidence: [],
      analysed_at: "2026-07-30T00:00:00.000Z",
      approved_at: "2026-07-31T00:00:00.000Z",
    }],
    vault_items: [{
      id: VAULT_ID,
      title: "Private credit guide",
      raw_content: "Private credit can provide flexible commercial funding.",
      ai_summary: "A practical guide to private credit.",
      category: "service",
      source_url: "https://example.com/private-credit",
      updated_at: "2026-07-31T00:00:00.000Z",
    }],
    brain_memory: [{
      id: MEMORY_ID,
      kind: "preference",
      content: "Prefer practical examples.",
      confidence: 90,
      pinned: true,
      scope: { surfaces: ["content"] },
    }],
    competitor_intelligence_runs: [],
    business_library_versions: [{
      id: LIBRARY_VERSION_ID,
      entry_id: LIBRARY_ENTRY_ID,
      version_number: 1,
      category_id: STYLE_ID,
      title: "SEO search intent",
      summary: "General guidance for matching a page to search intent.",
      body: "Choose one clear search intent, answer it thoroughly and measure qualified actions.",
      source_url: null,
      tags: ["seo"],
    }],
    business_library_entries: [{
      id: LIBRARY_ENTRY_ID,
      current_version_id: options.libraryCurrentVersionId ?? LIBRARY_VERSION_ID,
    }],
    business_library_categories: [{
      id: STYLE_ID,
      name: "SEO",
    }],
  };
  return {
    from(table: string) {
      const rows = fixtures[table] ?? [];
      if (table === "business_library_versions" && options.libraryRecoveryFails) {
        return new FakeQuery([], null, { message: "temporary published-release failure" });
      }
      return new FakeQuery(rows);
    },
    rpc(name: string) {
      if (name === "match_business_library_chunks_hybrid") {
        if (options.librarySearchFails) {
          return Promise.resolve({ data: null, error: { message: "temporary semantic failure" } });
        }
        return Promise.resolve({
          data: [{
            entry_id: LIBRARY_ENTRY_ID,
            version_id: LIBRARY_VERSION_ID,
            chunk_id: LIBRARY_CHUNK_ID,
            version_number: 1,
            title: "Private credit marketing basics",
            summary: "General guidance for marketing commercial finance.",
            content: "Explain the audience, risks and next step in plain language.",
            category: "Sales",
            source_url: null,
            tags: ["sales"],
            rank: 0.82,
            retrieval_method: "hybrid",
          }],
          error: null,
        });
      }
      if (name === "match_business_library_chunks") {
        if (options.librarySearchFails) {
          return Promise.resolve({
            data: null,
            error: { message: "temporary full-text failure" },
          });
        }
        return Promise.resolve({
          data: [{
            entry_id: LIBRARY_ENTRY_ID,
            version_id: LIBRARY_VERSION_ID,
            chunk_id: LIBRARY_CHUNK_ID,
            version_number: 1,
            title: "Private credit marketing basics",
            summary: "General guidance for marketing commercial finance.",
            content: "Explain the audience, risks and next step in plain language.",
            category: "Sales",
            source_url: null,
            tags: ["sales"],
            rank: 0.74,
          }],
          error: null,
        });
      }
      expect(name).toBe("match_vault_chunks");
      return Promise.resolve({
        data: [{
          id: CHUNK_ID,
          item_id: VAULT_ID,
          content: "Private credit can provide flexible commercial funding.",
          similarity: 0.82,
        }],
        error: null,
      });
    },
  };
}

describe("Brain Context Phase 1 resolver", () => {
  it("resolves one contract-valid, tenant-scoped context with exact provenance", async () => {
    const context = await resolveBrainContext({
      admin: fakeAdmin(),
      clientId: CLIENT_ID,
      request: {
        surface: "content",
        channel: "linkedin",
        topic: "Private credit for property investors",
        selectedVaultSourceIds: [],
        includeMarketIntelligence: false,
      },
      model: "test-model",
      promptVersion: "test-prompt",
      createdAt: "2026-07-31T01:00:00.000Z",
      embed: async () => Array.from({ length: 384 }, () => 0.01),
    });

    expect(() => brainContextSchema.parse(context)).not.toThrow();
    expect(context.knowledge.sources).toEqual([
      expect.objectContaining({
        itemId: VAULT_ID,
        chunkId: CHUNK_ID,
        selectionMethod: "semantic",
      }),
    ]);
    expect(context.style).toEqual(expect.objectContaining({
      source: "approved_channel_analysis",
      profileId: STYLE_ID,
      profileVersion: 2,
    }));
    expect(context.provenance).toEqual(expect.objectContaining({
      vaultItemIds: [VAULT_ID],
      vaultChunkIds: [CHUNK_ID],
      libraryVersionIds: [LIBRARY_VERSION_ID],
      libraryChunkIds: [LIBRARY_CHUNK_ID],
      memoryIds: [MEMORY_ID],
    }));
    expect(context.library.availability).toBe("available");
  });

  it("renders company facts, owned style and lessons as labelled sections", async () => {
    const context = await resolveBrainContext({
      admin: fakeAdmin(),
      clientId: CLIENT_ID,
      request: {
        surface: "content",
        channel: "linkedin",
        topic: "Private credit",
        selectedVaultSourceIds: [],
        includeMarketIntelligence: false,
      },
      createdAt: "2026-07-31T01:00:00.000Z",
    });
    const prompt = renderBrainContext(context);

    expect(prompt).toContain("=== COMPANY CONTEXT ===");
    expect(prompt).toContain("=== COMPANY VAULT KNOWLEDGE ===");
    expect(prompt).toContain("=== BUSINESS LIBRARY GUIDANCE");
    expect(prompt).toContain("NEVER COMPANY FACTS");
    expect(prompt).toContain("=== APPLIED VOICE AND STYLE ===");
    expect(prompt).toContain("=== APPROVED EDITORIAL LESSONS ===");
    expect(prompt).not.toContain("MARKET INSPIRATION");
  });

  it("recovers Library retrieval from current published releases and reports degradation", async () => {
    const context = await resolveBrainContext({
      admin: fakeAdmin({ librarySearchFails: true }),
      clientId: CLIENT_ID,
      request: {
        surface: "ask",
        topic: "How should SEO pages match search intent?",
        selectedVaultSourceIds: [],
        includeMarketIntelligence: false,
      },
      createdAt: "2026-07-31T01:00:00.000Z",
    });

    expect(context.library).toEqual(expect.objectContaining({
      retrievalMethod: "lexical_recovery",
      availability: "degraded",
      sources: [expect.objectContaining({
        versionId: LIBRARY_VERSION_ID,
        selectionMethod: "lexical_recovery",
      })],
    }));
    expect(context.warnings).toContainEqual(expect.objectContaining({
      code: "business_library_search_degraded",
    }));
  });

  it("never recovers a superseded Library release", async () => {
    const context = await resolveBrainContext({
      admin: fakeAdmin({
        librarySearchFails: true,
        libraryCurrentVersionId: "99999999-9999-4999-8999-999999999999",
      }),
      clientId: CLIENT_ID,
      request: {
        surface: "ask",
        topic: "How should SEO pages match search intent?",
        selectedVaultSourceIds: [],
        includeMarketIntelligence: false,
      },
      createdAt: "2026-07-31T01:00:00.000Z",
    });

    expect(context.library.availability).toBe("degraded");
    expect(context.library.sources).toEqual([]);
    expect(context.provenance.libraryVersionIds).toEqual([]);
  });

  it("preserves company context in a valid snapshot when the Library is temporarily unavailable", async () => {
    const context = await resolveBrainContext({
      admin: fakeAdmin({
        librarySearchFails: true,
        libraryRecoveryFails: true,
      }),
      clientId: CLIENT_ID,
      request: {
        surface: "ask",
        topic: "What should we improve?",
        selectedVaultSourceIds: [],
        includeMarketIntelligence: false,
      },
      createdAt: "2026-07-31T01:00:00.000Z",
    });

    expect(() => brainContextSchema.parse(context)).not.toThrow();
    expect(context.company.fields.company_name).toBe("Example Co");
    expect(context.knowledge.sources).toHaveLength(1);
    expect(context.library).toEqual(expect.objectContaining({
      availability: "unavailable",
      retrievalMethod: "none",
      sources: [],
    }));
    expect(context.warnings).toContainEqual(expect.objectContaining({
      code: "business_library_unavailable",
      severity: "warning",
    }));
  });
});
