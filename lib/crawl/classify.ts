/**
 * Page classification for full-site crawls.
 *
 * Corpus quality beats corpus size: embedding 300 near-identical product pages
 * poisons retrieval, while policies/about/FAQ pages answer real VA questions.
 * So every scraped page is sorted into a treatment class BEFORE it becomes a
 * vault item. Deterministic heuristics (URL + content shape) — no LLM call,
 * fully unit-testable, free.
 *
 *   core    → full vault item, embedded (about, contact, FAQ, policies, trade…)
 *   product → aggregated into one "Product Catalog" item, not stored per page
 *   blog    → kept as an item only if substantial; lower value
 *   drop    → never stored (cart, login, legal boilerplate, thin pages)
 */

export type PageClass = "core" | "product" | "blog" | "drop";

// Legal boilerplate — checked before everything so "terms-of-service" can
// never sneak into core via a word like "service".
const LEGAL_RE = /(privacy|terms-|terms_|terms-of|conditions|cookie)/i;

// Pages that answer the questions VAs actually ask. Checked before DROP_RE —
// a shipping-policy page under /policies/ must never fall into the drop bucket.
const CORE_RE =
  /(shipping|delivery|returns?|refunds?|warranty|guarantee|faq|about|contact|trade|wholesale|how-it-works|payments?|size-guide|care|assembly|showroom|stockists?|reviews?|story|team|services?)/i;

// Account plumbing — no knowledge value.
const DROP_RE =
  /(\/cart|\/checkout|\/account|\/login|\/register|\/signin|\/signup|\/wishlist|\/search|\/compare)/i;

// Commerce catalog surfaces.
const PRODUCT_RE = /(\/products?\/|\/collections?\/|\/shop\/|\/store\/|\/item\/|\/category\/|\/catalogue?\/)/i;

const BLOG_RE = /(\/blog|\/news|\/journal|\/articles?|\/stories|\/inspiration|\/lookbook)/i;

/** Minimum content for a page to be worth keeping at all. */
const MIN_CONTENT_CHARS = 200;
/** Blog posts shorter than this are listicles/teasers — skip them. */
const MIN_BLOG_CHARS = 800;

export function classifyPage(url: string, markdown: string): PageClass {
  let path: string;
  try {
    const u = new URL(url);
    path = u.pathname.toLowerCase();
  } catch {
    return "drop";
  }

  const text = (markdown ?? "").trim();

  if (LEGAL_RE.test(path)) return "drop";
  if (BLOG_RE.test(path)) {
    return text.length >= MIN_BLOG_CHARS ? "blog" : "drop";
  }
  if (CORE_RE.test(path)) {
    return text.length >= MIN_CONTENT_CHARS ? "core" : "drop";
  }
  if (DROP_RE.test(path)) return "drop";
  if (PRODUCT_RE.test(path)) return "product";
  if (text.length < MIN_CONTENT_CHARS) return "drop";
  // Homepage and anything else substantial counts as core context.
  return "core";
}

/** Pull display prices off a product/collection page. */
export function extractPrices(markdown: string): string[] {
  const matches = markdown.match(/\$\s?[\d,]+(?:\.\d{2})?/g) ?? [];
  const unique = Array.from(new Set(matches.map((m) => m.replace(/\s/g, ""))));
  return unique.slice(0, 12);
}

export interface CatalogEntry {
  title: string;
  url: string;
  prices: string[];
}

/** Build the aggregated "Product Catalog" markdown from per-page extracts. */
export function buildCatalogMarkdown(siteHost: string, entries: CatalogEntry[]): string {
  const allPrices = entries
    .flatMap((e) => e.prices)
    .map((p) => Number(p.replace(/[$,]/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);

  const lines: string[] = [`# Product Catalog — ${siteHost}`, ""];
  if (allPrices.length) {
    const min = Math.min(...allPrices);
    const max = Math.max(...allPrices);
    lines.push(`Observed price range across catalog pages: $${min.toLocaleString()} – $${max.toLocaleString()}`, "");
  }
  lines.push(`Catalog pages captured: ${entries.length}`, "");

  // Group by first meaningful path segment (collection).
  const groups = new Map<string, CatalogEntry[]>();
  for (const e of entries) {
    let seg = "other";
    try {
      const parts = new URL(e.url).pathname.split("/").filter(Boolean);
      seg = parts.length > 1 ? parts[parts.length - 2] : parts[0] ?? "other";
    } catch { /* keep "other" */ }
    groups.set(seg, [...(groups.get(seg) ?? []), e]);
  }

  Array.from(groups.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([group, items]) => {
      lines.push(`## ${group.replace(/[-_]+/g, " ")}`);
      for (const item of items.slice(0, 60)) {
        const price = item.prices.length ? ` — ${item.prices.slice(0, 3).join(", ")}` : "";
        lines.push(`- ${item.title}${price} (${item.url})`);
      }
      lines.push("");
    });

  return lines.join("\n");
}

/**
 * Grounding check for the dossier: every quoted figure (dollar amounts,
 * percentages, day/week counts) must literally appear in the scraped source
 * text, otherwise it's flagged. Kills hallucinated prices.
 */
export function verifyFigures(dossier: string, sourceText: string): { verified: number; unverified: string[] } {
  const figures = Array.from(
    new Set(dossier.match(/\$\s?[\d,]+(?:\.\d{2})?|\b\d+(?:\.\d+)?%|\b\d+\s?(?:days?|weeks?|months?|years?)\b/gi) ?? []),
  );
  const normalize = (s: string) => s.toLowerCase().replace(/[\s,]/g, "");
  const haystack = normalize(sourceText);
  const unverified: string[] = [];
  let verified = 0;
  for (const fig of figures) {
    if (haystack.includes(normalize(fig))) verified++;
    else unverified.push(fig.trim());
  }
  return { verified, unverified };
}
