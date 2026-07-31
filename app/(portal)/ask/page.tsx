import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { AskVaultClient } from "@/components/vault/AskVaultClient";
import { PageIntro } from "@/components/layout/PageIntro";
import { createAdminClient } from "@/lib/supabase/admin";
import { ShieldAlert } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "RapidTal Coach" };

export default async function AskPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user, client } = ctx;
  if (!user.client_id) redirect("/dashboard");

  // The Brain Edge function authenticates the real JWT holder. Until the
  // impersonation boundary has a signed effective-identity handoff, allowing
  // Coach here would render the target role but retrieve as the real admin.
  if (ctx.impersonating) {
    return (
      <div className="page-prose">
        <PageIntro id="ask" />
        <div className="surface-card mx-auto max-w-2xl p-6">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <div>
              <h2 className="text-base font-semibold text-white">Coach is paused while viewing as another user</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Exit “Login as” before asking the Coach. This prevents an admin session from being mistaken for the Client or VA being viewed.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const canCurate = user.role === "client_admin" || user.role === "super_admin";
  const coachRole = user.role === "va" ? "va" : "client";
  const admin = createAdminClient();
  const [vaResult, taskResult] = await Promise.all([
    coachRole === "client" ? admin
      .from("users")
      .select("id,full_name,email")
      .eq("client_id", user.client_id)
      .eq("role", "va")
      .order("full_name", { ascending: true }) : Promise.resolve({ data: [] }),
    (() => {
      let query = admin.from("tasks").select("id,title,status").eq("client_id", user.client_id).order("updated_at", { ascending: false }).limit(100);
      if (coachRole === "va") query = query.eq("assigned_to", user.id);
      return query;
    })(),
  ]);
  const vaRows = vaResult.data;
  const teamMembers = (vaRows ?? []).map((member) => ({
    id: member.id,
    name: member.full_name || member.email,
  }));

  return (
    <div className="page-prose">
      <PageIntro id="ask" />
      <AskVaultClient
        clientId={user.client_id}
        companyName={client?.name ?? "your company"}
        canCurate={canCurate}
        coachRole={coachRole}
        speakerName={user.full_name || user.email}
        teamMembers={teamMembers}
        taskOptions={(taskResult.data ?? []).map((task) => ({ id: task.id, title: task.title, status: task.status as "todo" | "in_progress" | "review" | "done" }))}
      />
    </div>
  );
}
