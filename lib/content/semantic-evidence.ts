import { embedVaultQuery } from "@/lib/brain/resolver";

export interface SemanticEvidenceMatch {
  itemId: string;
  chunkId: string;
  excerpt: string;
  similarity: number;
}

/**
 * Retrieve the best Vault chunk per item for a content task. The RPC enforces
 * the tenant and governed factual-source boundary; this helper only dedupes
 * chunks into editor-friendly evidence options.
 */
export async function matchSemanticEvidence(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  clientId: string,
  query: string,
  limit = 40,
): Promise<{ available: boolean; matches: SemanticEvidenceMatch[] }> {
  const embedding = await embedVaultQuery(query);
  if (!embedding) return { available: false, matches: [] };
  try {
    const { data, error } = await db.rpc("match_vault_chunks", {
      p_client_id: clientId,
      p_query_embedding: embedding,
      p_match_count: Math.max(1, Math.min(limit, 100)),
    });
    if (error) throw error;
    const bestByItem = new Map<string, SemanticEvidenceMatch>();
    for (const raw of data ?? []) {
      const itemId = typeof raw?.item_id === "string" ? raw.item_id : "";
      const chunkId = typeof raw?.id === "string" ? raw.id : "";
      const excerpt = typeof raw?.content === "string" ? raw.content.trim().slice(0, 800) : "";
      const similarity = typeof raw?.similarity === "number" ? raw.similarity : 0;
      if (!itemId || !chunkId || !excerpt || similarity < 0.25) continue;
      const existing = bestByItem.get(itemId);
      if (!existing || similarity > existing.similarity) {
        bestByItem.set(itemId, { itemId, chunkId, excerpt, similarity });
      }
    }
    return {
      available: true,
      matches: [...bestByItem.values()].sort((left, right) => right.similarity - left.similarity),
    };
  } catch (error) {
    console.warn("[content/evidence] semantic Vault retrieval unavailable", error);
    return { available: false, matches: [] };
  }
}
