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

class FakeQuery {
  constructor(
    private readonly rows: unknown[],
    private readonly singleRow: unknown = rows[0] ?? null,
  ) {}
  select() { return this; }
  eq() { return this; }
  or() { return this; }
  in() { return this; }
  order() { return this; }
  contains() { return this; }
  limit() { return this; }
  maybeSingle() {
    return Promise.resolve({ data: this.singleRow, error: null });
  }
  then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
    return Promise.resolve({ data: this.rows, error: null }).then(resolve);
  }
}

function fakeAdmin() {
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
  };
  return {
    from(table: string) {
      const rows = fixtures[table] ?? [];
      return new FakeQuery(rows);
    },
    rpc(name: string) {
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
      embed: async () => [0.1, 0.2],
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
      memoryIds: [MEMORY_ID],
    }));
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
    expect(prompt).toContain("=== APPLIED VOICE AND STYLE ===");
    expect(prompt).toContain("=== APPROVED EDITORIAL LESSONS ===");
    expect(prompt).not.toContain("MARKET INSPIRATION");
  });
});
