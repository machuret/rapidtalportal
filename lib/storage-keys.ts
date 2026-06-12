/**
 * Supabase Storage rejects object keys with non-ASCII or special characters
 * (em dashes "—", smart quotes, many unicode glyphs) — uploads fail with
 * "Invalid key". Derive a safe key segment from a user-supplied filename;
 * keep the original elsewhere (e.g. a `title` column) for display.
 */
export function safeKeyName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1) : "";
  const slug =
    base
      .normalize("NFKD")
      .replace(/[^\w.-]+/g, "-") // spaces, em dashes, unicode → "-"
      .replace(/-+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(0, 100) || "file";
  const safeExt = ext.replace(/[^\w]/g, "").slice(0, 10).toLowerCase();
  return safeExt ? `${slug}.${safeExt}` : slug;
}
