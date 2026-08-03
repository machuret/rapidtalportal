import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/with-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications";
import { onboardingMutationLimiter, tooManyRequests } from "@/lib/rate-limit";
import { serverError } from "@/lib/api/errors";

export const POST = withAuth(async (_req, { user }) => {
  if (user.role !== "client_admin" || !user.client_id) {
    return NextResponse.json({ error: "Only a client admin can request a VA assignment." }, { status: 403 });
  }

  const limited = await onboardingMutationLimiter.check(`va-assignment:${user.client_id}`);
  if (!limited.allowed) return tooManyRequests(limited.retryAfterSeconds);

  const admin = createAdminClient();
  const { data, error } = await (admin as unknown as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{
      data: string | null;
      error: { message: string; code?: string } | null;
    }>;
  }).rpc("request_client_va_assignment", {
    p_client_id: user.client_id,
    p_requested_by: user.id,
  });

  if (error) {
    if (error.message.includes("va_already_assigned")) {
      return NextResponse.json({ error: "A VA is already assigned to your company." }, { status: 409 });
    }
    if (error.message.includes("assignment_request_forbidden")) {
      return NextResponse.json({ error: "You cannot request an assignment for this company." }, { status: 403 });
    }
    return serverError(error, { userId: user.id, clientId: user.client_id, url: "/api/onboarding/request-va" });
  }
  if (!data) return serverError(new Error("VA assignment request did not return an id."));

  const { data: adminRows, error: adminsError } = await admin
    .from("users")
    .select("id")
    .eq("role", "super_admin");
  if (adminsError) {
    return serverError(adminsError, { userId: user.id, clientId: user.client_id, url: "/api/onboarding/request-va" });
  }

  await notify(((adminRows ?? []) as Array<{ id: string }>).map((row) => row.id), {
    clientId: user.client_id,
    type: "va_assignment_requested",
    title: "A client requested a VA assignment",
    body: "Open the client record to arrange their placement.",
    href: `/admin/clients/${user.client_id}`,
  });

  return NextResponse.json({ requestId: data, status: "pending" }, { status: 201 });
}, { roles: ["client_admin"] });
