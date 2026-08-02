import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type {
  BusinessLibraryCategory,
  BusinessLibraryEntryDetail,
  BusinessLibraryEntrySummary,
  BusinessLibraryVersion,
} from "@/lib/business-library/shared";

type AdminClient = SupabaseClient<Database>;
type CategoryRow = Database["public"]["Tables"]["business_library_categories"]["Row"];
type EntryRow = Database["public"]["Tables"]["business_library_entries"]["Row"];
type VersionRow = Database["public"]["Tables"]["business_library_versions"]["Row"];

export function mapBusinessLibraryCategory(row: CategoryRow): BusinessLibraryCategory {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

export function mapBusinessLibraryVersion(row: VersionRow): BusinessLibraryVersion {
  return {
    id: row.id,
    entryId: row.entry_id,
    versionNumber: row.version_number,
    status: row.status,
    categoryId: row.category_id,
    title: row.title,
    summary: row.summary,
    body: row.body,
    sourceUrl: row.source_url,
    tags: row.tags,
    industries: row.industries,
    countries: row.countries,
    audiences: row.audiences,
    lifecycleStages: row.lifecycle_stages,
    channels: row.channels,
    timeSensitive: row.time_sensitive,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    reviewDueAt: row.review_due_at,
    changeNote: row.change_note,
    contentHash: row.content_hash,
    createdBy: row.created_by,
    submittedAt: row.submitted_at,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSummary(
  entry: EntryRow,
  versions: BusinessLibraryVersion[],
): BusinessLibraryEntrySummary {
  const workingVersion = versions
    .filter((version) => ["draft", "in_review"].includes(version.status))
    .sort((a, b) => b.versionNumber - a.versionNumber)[0] ?? null;
  const publishedVersion = entry.current_version_id
    ? versions.find((version) => version.id === entry.current_version_id) ?? null
    : null;

  return {
    id: entry.id,
    slug: entry.slug,
    currentVersionId: entry.current_version_id,
    retiredAt: entry.retired_at,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
    workingVersion,
    publishedVersion,
  };
}

export async function loadBusinessLibrary(admin: AdminClient): Promise<{
  categories: BusinessLibraryCategory[];
  entries: BusinessLibraryEntrySummary[];
}> {
  const [categoriesResult, entriesResult, versionsResult] = await Promise.all([
    admin
      .from("business_library_categories")
      .select("*")
      .order("sort_order")
      .order("name"),
    admin
      .from("business_library_entries")
      .select("*")
      .order("updated_at", { ascending: false }),
    admin
      .from("business_library_versions")
      .select("*")
      .in("status", ["draft", "in_review", "published", "retired"])
      .order("version_number", { ascending: false }),
  ]);

  if (categoriesResult.error) throw categoriesResult.error;
  if (entriesResult.error) throw entriesResult.error;
  if (versionsResult.error) throw versionsResult.error;

  const versionsByEntry = new Map<string, BusinessLibraryVersion[]>();
  for (const row of versionsResult.data ?? []) {
    const version = mapBusinessLibraryVersion(row);
    const versions = versionsByEntry.get(version.entryId) ?? [];
    versions.push(version);
    versionsByEntry.set(version.entryId, versions);
  }

  return {
    categories: (categoriesResult.data ?? []).map(mapBusinessLibraryCategory),
    entries: (entriesResult.data ?? []).map((entry) =>
      toSummary(entry, versionsByEntry.get(entry.id) ?? []),
    ),
  };
}

export async function loadBusinessLibraryEntry(
  admin: AdminClient,
  entryId: string,
): Promise<BusinessLibraryEntryDetail | null> {
  const [entryResult, versionsResult] = await Promise.all([
    admin
      .from("business_library_entries")
      .select("*")
      .eq("id", entryId)
      .maybeSingle(),
    admin
      .from("business_library_versions")
      .select("*")
      .eq("entry_id", entryId)
      .order("version_number", { ascending: false }),
  ]);

  if (entryResult.error) throw entryResult.error;
  if (versionsResult.error) throw versionsResult.error;
  if (!entryResult.data) return null;

  const versions = (versionsResult.data ?? []).map(mapBusinessLibraryVersion);
  return {
    ...toSummary(entryResult.data, versions),
    versions,
  };
}
