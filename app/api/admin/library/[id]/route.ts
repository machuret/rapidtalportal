import { NextResponse } from "next/server";
import { withSuperAdmin } from "@/lib/api/with-auth";
import { serverError } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  businessLibraryUpdateSchema,
  businessLibraryValidationMessage,
} from "@/lib/business-library";
import { loadBusinessLibraryEntry } from "@/lib/business-library-admin";

export const dynamic = "force-dynamic";

type Params = { id: string };

export const GET = withSuperAdmin<Params>(async (_request, { params }) => {
  const admin = createAdminClient();
  try {
    const entry = await loadBusinessLibraryEntry(admin, params.id);
    if (!entry) {
      return NextResponse.json({ error: "Library entry not found." }, { status: 404 });
    }
    return NextResponse.json({ entry });
  } catch (error) {
    return serverError(error);
  }
});

export const PATCH = withSuperAdmin<Params>(async (request, { user, params }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = businessLibraryUpdateSchema.safeParse(body);
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

  const { data: updated, error } = await admin
    .from("business_library_versions")
    .update({
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
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.versionId)
    .eq("entry_id", params.id)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();

  if (error) return serverError(error);
  if (!updated) {
    return NextResponse.json({
      error: "Only a draft can be edited. Return it from review or create a new version.",
    }, { status: 409 });
  }

  const now = new Date().toISOString();
  const [{ error: entryError }, { error: eventError }] = await Promise.all([
    admin
      .from("business_library_entries")
      .update({ updated_at: now })
      .eq("id", params.id),
    admin
      .from("business_library_events")
      .insert({
        entry_id: params.id,
        version_id: input.versionId,
        action: "draft_saved",
        actor_id: user.id,
      }),
  ]);
  if (entryError) return serverError(entryError);
  if (eventError) {
    console.warn("[business-library] save event:", eventError.message);
  }

  const entry = await loadBusinessLibraryEntry(admin, params.id);
  return NextResponse.json({ entry });
});
