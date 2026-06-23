/**
 * /api/my-job/leave — leave requests.
 * GET   → the caller's own requests (VA), or their client's via ?scope=client (admin).
 * POST  → a VA requests leave; the client admins are notified.
 * PATCH → an admin approves/declines a request.
 */
import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify, clientAdminIds } from "@/lib/notifications";

export const dynamic = "force-dynamic";

const ADMIN = ["client_admin", "super_admin"];

export const GET = withAuth(async (req, { user }) => {
  const admin = createAdminClient();
  const scope = req.nextUrl.searchParams.get("scope");
  if (scope === "client" && ADMIN.includes(user.role) && user.client_id) {
    const { data } = await admin.from("va_leave_requests").select("*").eq("client_id", user.client_id).order("start_date", { ascending: false });
    return NextResponse.json({ requests: data ?? [] });
  }
  const { data } = await admin.from("va_leave_requests").select("*").eq("user_id", user.id).order("start_date", { ascending: false });
  return NextResponse.json({ requests: data ?? [] });
});

const postSchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  leave_type: z.enum(["annual", "sick", "unpaid", "personal"]).optional(),
  reason: z.string().max(500).nullable().optional(),
});

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success || parsed.data.end_date < parsed.data.start_date) {
    return NextResponse.json({ error: "Pick a valid date range." }, { status: 422 });
  }

  const admin = createAdminClient();

  // Reject a request that overlaps an existing pending/approved one, so the same
  // days can't be double-booked (and double-counted against the balance).
  const { data: clash } = await admin
    .from("va_leave_requests")
    .select("id")
    .eq("user_id", user.id)
    .in("status", ["pending", "approved"])
    .lte("start_date", parsed.data.end_date)
    .gte("end_date", parsed.data.start_date)
    .limit(1);
  if (clash && clash.length > 0) {
    return NextResponse.json({ error: "You already have a leave request overlapping those dates." }, { status: 409 });
  }

  const { data, error } = await admin
    .from("va_leave_requests")
    .insert({ user_id: user.id, client_id: user.client_id, ...parsed.data })
    .select("*")
    .single();
  if (error) return serverError(error);

  if (user.client_id) {
    const [admins, { data: me }] = await Promise.all([
      clientAdminIds(user.client_id),
      admin.from("users").select("full_name").eq("id", user.id).maybeSingle(),
    ]);
    const name = (me as { full_name: string | null } | null)?.full_name ?? "A team member";
    void notify(admins, {
      clientId: user.client_id,
      type: "leave",
      title: "Leave request",
      body: `${name} requested ${parsed.data.leave_type ?? "annual"} leave ${parsed.data.start_date} → ${parsed.data.end_date}.`,
      href: "/my-job",
      email: {
        subject: `Leave request from ${name}`,
        heading: "A team member requested leave",
        paragraphs: [
          `${name} requested ${parsed.data.leave_type ?? "annual"} leave from ${parsed.data.start_date} to ${parsed.data.end_date}.`,
          "Review and approve or decline it in the portal.",
        ],
        ctaLabel: "Review the request",
      },
    });
  }
  return NextResponse.json({ request: data });
});

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["approved", "declined"]),
});

export const PATCH = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const admin = createAdminClient();
  const { data: row } = await admin.from("va_leave_requests").select("client_id, user_id, status").eq("id", parsed.data.id).maybeSingle();
  const r = row as { client_id: string | null; user_id: string; status: string } | null;
  if (!r) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  const denied = assertClientAccess(user, r.client_id ?? "");
  if (denied) return denied;

  // Only pending requests can be decided — re-reviewing a decided one would
  // re-fire notifications and (for declined→approved) re-count the balance.
  if (r.status !== "pending") {
    return NextResponse.json({ error: `This request was already ${r.status}.` }, { status: 409 });
  }

  const { data, error } = await admin
    .from("va_leave_requests")
    .update({ status: parsed.data.status, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .select("*")
    .single();
  if (error) return serverError(error);

  void notify([r.user_id], {
    clientId: r.client_id,
    type: "leave",
    title: `Leave ${parsed.data.status}`,
    body: `Your leave request was ${parsed.data.status}.`,
    href: "/my-job",
    email: {
      subject: `Your leave request was ${parsed.data.status}`,
      heading: `Leave ${parsed.data.status}`,
      paragraphs: [
        `Your leave request has been ${parsed.data.status}.`,
        parsed.data.status === "approved"
          ? "It's been recorded against your leave balance. Enjoy your time off!"
          : "If you have questions, reach out to your client admin.",
      ],
      ctaLabel: "View in My Job",
    },
  });
  return NextResponse.json({ request: data });
}, { roles: ADMIN });
