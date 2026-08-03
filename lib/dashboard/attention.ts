export interface DedupeableAttentionItem {
  id: string;
  title: string;
  detail: string;
  href: string;
  severity: string;
}

/**
 * Collapse operational failures that would otherwise render as identical rows.
 * The destination stays actionable while the count makes the scope explicit.
 */
export function dedupeAttentionItems<T extends DedupeableAttentionItem>(items: T[]): T[] {
  const grouped = new Map<string, { item: T; count: number }>();

  for (const item of items) {
    const key = [item.href, item.title, item.detail, item.severity]
      .map((value) => value.trim().toLocaleLowerCase())
      .join("\u0000");
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      grouped.set(key, { item, count: 1 });
    }
  }

  return Array.from(grouped.values()).map(({ item, count }) => (
    count === 1
      ? item
      : { ...item, detail: `${count} affected · ${item.detail}` }
  ));
}
