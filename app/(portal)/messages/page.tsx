import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { MessagesClient } from "@/components/messages/MessagesClient";
import { PageIntro } from "@/components/layout/PageIntro";

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

  return (
    <>
      <PageIntro id="messages" />
      <MessagesClient
        currentUserId={user.id}
        currentUserRole={user.role}
        clientId={user.client_id}
      />
    </>
  );
}
