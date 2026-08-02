import { NextResponse } from "next/server";
import { withSuperAdmin } from "@/lib/api/with-auth";
import { serverError } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  businessLibraryCreateSchema,
  businessLibraryValidationMessage,
} from "@/lib/business-library/shared";
import { loadBusinessLibrary, loadBusinessLibraryEntry } from "@/lib/business-library/admin";

export const dynamic = "force-dynamic";

export const GET = withSuperAdmin(async () => {
  const admin = createAdminClient();
  try {
    return NextResponse.json(await loadBusinessLibrary(admin));
  } catch (error) {
    return serverError(error);
  }
});

export const POST = withSuperAdmin(async (request, { user }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = businessLibraryCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({
      error: businessLibraryValidationMessage(parsed.error),
    }, { status: 422 });
  }

  const admin = createAdminClient();
  const input = parsed.data;
  const { data: category } = await admin
    .from("business_library_categories")
    .select("id")
    .eq("id", input.categoryId)
    .eq("is_active", true)
    .maybeSingle();
  if (!category) {
    return NextResponse.json({ error: "Choose an active Library category." }, { status: 422 });
  }

  const { data: entry, error: entryError } = await admin
    .from("business_library_entries")
    .insert({
      slug: input.slug,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (entryError) {
    if (entryError.code === "23505") {
      return NextResponse.json({ error: "That Library slug is already in use." }, { status: 409 });
    }
    return serverError(entryError);
  }

  const { data: version, error: versionError } = await admin
    .from("business_library_versions")
    .insert({
      entry_id: entry.id,
      version_number: 1,
      status: "draft",
      category_id: input.categoryId,
      title: input.title,
      summary: input.summary,
      body: input.body,
      source_url: input.sourceUrl,
      tags: input.tags,
      industries: input.industries,
      countries: input.countries,
      audiences: input.audiences,
      lifecycle_stages: input.lifecycleStages,
      channels: input.channels,
      time_sensitive: input.timeSensitive,
      valid_from: input.validFrom,
      valid_until: input.validUntil,
      review_due_at: input.reviewDueAt,
      change_note: input.changeNote,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (versionError) {
    await admin.from("business_library_entries").delete().eq("id", entry.id);
    return serverError(versionError);
  }

  const { error: eventError } = await admin
    .from("business_library_events")
    .insert({
      entry_id: entry.id,
      version_id: version.id,
      action: "created",
      actor_id: user.id,
    });
  if (eventError) {
    console.warn("[business-library] create event:", eventError.message);
  }

  const detail = await loadBusinessLibraryEntry(admin, entry.id);
  return NextResponse.json({ entry: detail }, { status: 201 });
});
