import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { MessagesClient } from "@/components/messages/MessagesClient";
import { PageIntro } from "@/components/layout/PageIntro";
import type { Message } from "@/hooks/useMessages";

export const dynamic = "force-dynamic";
export const metadata = { title: "Messages — RapidTal" };

export default async function MessagesPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");

  const { user } = ctx;

  if (user.role === "super_admin") redirect("/dashboard");

  if (!user.client_id) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center px-6">
        <p className="text-zinc-400 text-sm">No client assigned to your account. Contact your administrator.</p>
      </div>
    );
  }

  // SSR-seed the first page so the thread renders instantly instead of a
  // spinner; the client query takes over from here (same bounded shape as
  // the API: newest 100, role-scoped).
  const admin = createAdminClient();
  let query = admin
    .from("messages")
    .select("id, client_id, sender_id, sender_name, sender_role, body, audience, read_by, created_at")
    .eq("client_id", user.client_id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (user.role === "client_admin") {
    query = query.or(`audience.in.(company,client),sender_id.eq.${user.id}`);
  } else if (user.role === "va") {
    query = query.or(`audience.in.(company,va_team),sender_id.eq.${user.id}`);
  }
  const { data } = await query;
  const initialMessages = [...((data ?? []) as Message[])].reverse();

  return (
    <>
      <PageIntro id="messages" />
      <MessagesClient
        currentUserId={user.id}
        currentUserRole={user.role}
        clientId={user.client_id}
        initialMessages={initialMessages}
      />
    </>
  );
}
