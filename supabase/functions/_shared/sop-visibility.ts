export interface SopVisibilityRow {
  id: string;
  client_id: string | null;
  visibility: string;
  deleted_at?: string | null;
}

interface SopVisibilityOptions {
  clientId: string;
  role: string;
  grantedSopIds: Iterable<string>;
  limit?: number;
}

/**
 * Apply the same read policy used by the SOP library/detail pages before SOP
 * content is handed to an AI surface.
 *
 * The caller may use a service-role database client, so this check is a required
 * authorization boundary rather than a presentation-layer convenience.
 */
export function visibleSopsForUser<T extends SopVisibilityRow>(
  rows: T[],
  options: SopVisibilityOptions,
): T[] {
  const granted = new Set(options.grantedSopIds);
  const limit = options.limit ?? rows.length;

  return rows
    .filter((row) => {
      if (row.deleted_at) return false;
      if (row.client_id !== null && row.client_id !== options.clientId) return false;
      if (options.role === "super_admin") return true;
      if (row.visibility === "public") return true;
      return row.visibility === "restricted" && granted.has(row.id);
    })
    .slice(0, limit);
}
