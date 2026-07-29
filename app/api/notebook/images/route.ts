/**
 * Notebook page images (private bucket `notebook-images`, layout
 * placement_id/page_id/filename).
 * POST — upload an image; returns a stable proxy URL to embed in the doc.
 * GET ?path= — verify access via RLS and 307-redirect to a fresh signed URL.
 *
 * Both go through the USER-scoped client, so storage RLS gates by placement
 * participation and admins (non-participants) are blocked — same exclusion as
 * page content.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { withAuth } from "@/lib/api/with-auth";

const BUCKET = "notebook-images";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };

export const POST = withAuth(async (req) => {
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 }); }

  const file = form.get("file");
  const placementId = String(form.get("placementId") ?? "");
  const pageId = String(form.get("pageId") ?? "");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "No file." }, { status: 422 });
  if (!z.string().uuid().safeParse(placementId).success || !z.string().uuid().safeParse(pageId).success) {
    return NextResponse.json({ error: "Invalid placement or page." }, { status: 422 });
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image must be under 5 MB." }, { status: 422 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: "Use PNG, JPEG, GIF, or WebP." }, { status: 422 });

  const sb = await createClient();
  const path = `${placementId}/${pageId}/${crypto.randomUUID()}.${EXT[file.type]}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) return NextResponse.json({ error: "Upload failed (or not permitted)." }, { status: 403 });

  return NextResponse.json({ url: `/api/notebook/images?path=${encodeURIComponent(path)}` }, { status: 201 });
});

export const GET = withAuth(async (req) => {
  const path = req.nextUrl.searchParams.get("path");
  if (!path) return NextResponse.json({ error: "path required." }, { status: 422 });

  const sb = await createClient();
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  return NextResponse.redirect(data.signedUrl, 307);
});
