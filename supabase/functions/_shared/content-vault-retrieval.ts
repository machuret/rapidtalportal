export interface ContentVaultSource {
  itemId: string;
  title: string;
  kind: "semantic" | "vault_item";
  excerpt: string;
  similarity: number | null;
}

export interface ContentStyleExampleSource {
  itemId: string;
  title: string;
  sourceUrl: string | null;
}

interface VaultItem {
  id: string;
  title: string;
  raw_content: string | null;
  category: string | null;
  ai_summary: string | null;
  source_url?: string | null;
}

/**
 * The single retrieval implementation for content creation, replies, rewrites
 * and platform adaptations. Ask-the-Vault remains a Q&A surface; every content
 * artifact goes through this function.
 */
export async function retrieveContentVault(args: {
  // deno-lint-ignore no-explicit-any
  admin: any;
  clientId: string;
  query: string;
  relevantCategories: string[];
  styleChannel?: string;
}): Promise<{
  context: string;
  sources: ContentVaultSource[];
  styleSources: ContentStyleExampleSource[];
  groundedCount: number;
}> {
  const { admin, clientId, query, relevantCategories, styleChannel } = args;
  const { data: rawRows, error: vaultError } = await admin
    .from("vault_items")
    .select("id,title,raw_content,category,ai_summary")
    .eq("client_id", clientId)
    .eq("status", "ready")
    .eq("evidence_role", "factual")
    .order("created_at", { ascending: false })
    .limit(100);

  if (vaultError) throw new Error(`Vault retrieval failed: ${vaultError.message}`);

  const vaultItems = ((rawRows ?? []) as VaultItem[]).sort((a, b) => {
    const ai = relevantCategories.indexOf(a.category ?? "general");
    const bi = relevantCategories.indexOf(b.category ?? "general");
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  }).slice(0, 30);

  const sources: ContentVaultSource[] = [];
  const semanticItemIds = new Set<string>();
  let semanticBlock = "";
  let groundedCount = 0;

  try {
    // deno-lint-ignore no-explicit-any
    const session = new (globalThis as any).Supabase.ai.Session("gte-small");
    const embedding = await session.run(query.slice(0, 1500), {
      mean_pool: true,
      normalize: true,
    });
    const { data: chunks, error: chunkError } = await admin.rpc("match_vault_chunks", {
      p_client_id: clientId,
      p_query_embedding: embedding,
      p_match_count: 10,
    });
    if (chunkError) throw chunkError;

    type Chunk = { item_id: string; content: string; similarity: number };
    const rows = ((chunks ?? []) as Chunk[]).filter((chunk) => chunk.similarity > 0.25);
    const titleById = new Map(vaultItems.map((item) => [item.id, item.title]));
    for (const chunk of rows) {
      const excerpt = chunk.content.slice(0, 700);
      const entry = `[SOURCE ${chunk.item_id} — ${titleById.get(chunk.item_id) ?? "Document"}] ${excerpt}\n\n`;
      if (semanticBlock.length + entry.length > 6000) break;
      semanticBlock += entry;
      groundedCount++;
      if (!semanticItemIds.has(chunk.item_id)) {
        semanticItemIds.add(chunk.item_id);
        sources.push({
          itemId: chunk.item_id,
          title: titleById.get(chunk.item_id) ?? "Document",
          kind: "semantic",
          excerpt,
          similarity: chunk.similarity,
        });
      }
    }
  } catch (error) {
    console.warn("content retrieval: semantic search unavailable; using ready Vault items:", error);
  }

  let fallbackBlock = "";
  for (const item of vaultItems.slice(0, groundedCount > 0 ? 6 : 15)) {
    if (semanticItemIds.has(item.id)) continue;
    const excerpt = item.ai_summary
      ? `${item.ai_summary}\n${item.raw_content?.slice(0, 1200) ?? ""}`
      : item.raw_content?.slice(0, 2400) ?? "";
    if (!excerpt.trim()) continue;
    const entry = `--- SOURCE ${item.id} — ${item.title} ---\n${excerpt}\n\n`;
    if (fallbackBlock.length + entry.length > 12000) break;
    fallbackBlock += entry;
    sources.push({
      itemId: item.id,
      title: item.title,
      kind: "vault_item",
      excerpt: excerpt.slice(0, 700),
      similarity: null,
    });
  }

  let styleBlock = "";
  const styleSources: ContentStyleExampleSource[] = [];
  if (styleChannel) {
    const { data: styleRows, error: styleError } = await admin
      .from("vault_items")
      .select("id,title,raw_content,ai_summary,source_url")
      .eq("client_id", clientId)
      .eq("status", "ready")
      .eq("evidence_role", "style_example")
      .contains("tags", [styleChannel])
      .order("created_at", { ascending: false })
      .limit(8);
    if (styleError) throw new Error(`Style-example retrieval failed: ${styleError.message}`);

    for (const item of (styleRows ?? []) as VaultItem[]) {
      const excerpt = item.raw_content?.trim().slice(0, 1800) ?? "";
      if (!excerpt) continue;
      const entry = `--- STYLE EXAMPLE ${item.id} — ${item.title} ---\n${excerpt}\n\n`;
      if (styleBlock.length + entry.length > 9000) break;
      styleBlock += entry;
      styleSources.push({
        itemId: item.id,
        title: item.title,
        sourceUrl: item.source_url ?? null,
      });
    }
  }

  const context = [
    semanticBlock
      ? `=== MOST RELEVANT VAULT KNOWLEDGE ===\n${semanticBlock}`
      : "",
    fallbackBlock
      ? `=== SUPPORTING VAULT MATERIAL ===\n${fallbackBlock}`
      : "",
    styleBlock
      ? "=== OWNED CHANNEL STYLE EXAMPLES ===\nUse these only to learn voice, rhythm, formatting and content patterns. Never treat them as factual evidence, never copy distinctive wording, and never use them to support a claim.\n" + styleBlock
      : "",
  ].filter(Boolean).join("\n");

  return { context, sources: sources.slice(0, 20), styleSources, groundedCount };
}
