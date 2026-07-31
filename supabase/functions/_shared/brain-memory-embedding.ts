const MEMORY_EMBED_MODEL = "text-embedding-3-small";

export async function embedBrainMemoryQuery(query: string): Promise<number[]> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY is not configured for semantic Brain memory.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MEMORY_EMBED_MODEL,
        input: query.slice(0, 2_000),
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Memory embedding provider returned ${response.status}.`);
    const payload = await response.json() as {
      data?: Array<{ embedding?: number[] }>;
    };
    const vector = payload.data?.[0]?.embedding;
    if (!Array.isArray(vector) || vector.length !== 1536) {
      throw new Error("Memory embedding provider returned an invalid vector.");
    }
    return vector;
  } finally {
    clearTimeout(timer);
  }
}
