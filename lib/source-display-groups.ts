export interface SourceDisplayGroup<T> {
  representative: T;
  sources: T[];
  count: number;
}

interface SourceDisplayGroupOptions<T> {
  namespace: (source: T) => string;
  identity: (source: T) => string | null | undefined;
  title: (source: T) => string;
  url?: (source: T) => string | null | undefined;
  excerpt?: (source: T) => string | null | undefined;
}

const DISPLAY_STOP_WORDS = new Set([
  "about", "after", "and", "are", "company", "for", "from", "has", "have",
  "into", "its", "more", "our", "page", "results", "that", "the", "their",
  "this", "through", "using", "was", "were", "with", "your",
]);

function normalizedText(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function canonicalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    parsed.search = "";
    parsed.hostname = parsed.hostname.toLocaleLowerCase().replace(/^www\./, "");
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return parsed.toString();
  } catch {
    return normalizedText(value) || null;
  }
}

function wordSet(value: string | null | undefined): Set<string> {
  if (!value) return new Set();
  return new Set(normalizedText(value)
    .split(" ")
    .filter((word) => word.length >= 3 && !DISPLAY_STOP_WORDS.has(word)));
}

function similarity(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const word of left) if (right.has(word)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function sameDisplaySource<T>(
  left: T,
  right: T,
  options: SourceDisplayGroupOptions<T>,
): boolean {
  if (options.namespace(left) !== options.namespace(right)) return false;
  const leftId = options.identity(left);
  const rightId = options.identity(right);
  if (leftId && rightId && leftId === rightId) return true;

  const leftUrl = canonicalUrl(options.url?.(left));
  const rightUrl = canonicalUrl(options.url?.(right));
  if (leftUrl && rightUrl && leftUrl === rightUrl) return true;

  const leftTitle = normalizedText(options.title(left));
  const rightTitle = normalizedText(options.title(right));
  if (leftTitle && leftTitle === rightTitle) return true;

  // Catch mechanically duplicated crawl pages whose titles or extracted
  // passages vary slightly, without merging unrelated evidence merely because
  // it shares broad industry vocabulary.
  const titleSimilarity = similarity(wordSet(leftTitle), wordSet(rightTitle));
  const excerptSimilarity = similarity(
    wordSet(options.excerpt?.(left)),
    wordSet(options.excerpt?.(right)),
  );
  return titleSimilarity >= 0.8 && excerptSimilarity >= 0.55;
}

/**
 * Collapse display-only evidence duplicates while retaining every exact source
 * in the returned group for citations, lineage and audit. Persistence remains
 * untouched: this helper changes presentation, never provenance.
 */
export function groupSourcesForDisplay<T>(
  sources: T[],
  options: SourceDisplayGroupOptions<T>,
): SourceDisplayGroup<T>[] {
  const groups: SourceDisplayGroup<T>[] = [];
  for (const source of sources) {
    const existing = groups.find((group) =>
      sameDisplaySource(group.representative, source, options));
    if (existing) {
      existing.sources.push(source);
      existing.count += 1;
    } else {
      groups.push({ representative: source, sources: [source], count: 1 });
    }
  }
  return groups;
}

