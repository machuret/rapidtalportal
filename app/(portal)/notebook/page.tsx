import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NotebookApp, type PlacementOption, type NotebookParticipants } from "@/components/notebook/NotebookApp";
import { PageIntro } from "@/components/layout/PageIntro";
import { NotebookPen } from "lucide-react";
import type { NotebookPage } from "@/lib/notebook/types";
import { withPortalDataTimeout } from "@/lib/server-data-timeout";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notebook — RapidTal" };

export default async function NotebookPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ placement?: string; page?: string }> }) {
  const searchParams = await searchParamsPromise;
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user } = ctx;

  // Membership + display names are engagement metadata (not page content), so
  // the admin client is fine here. Page CONTENT below uses the user-scoped
  // client so RLS — not application code — enforces the access boundary.
  const admin = createAdminClient();
  const { data: placementRows, error: placementsError } = await withPortalDataTimeout(
    (signal) => admin
      .from("placements")
      .select("id, client_id, va_user_id, client_user_id, status")
      .or(`va_user_id.eq.${user.id},client_user_id.eq.${user.id}`)
      .eq("status", "active")
      .order("created_at")
      .abortSignal(signal),
    "Notebook placements",
    8_000,
  );
  if (placementsError) throw new Error("Notebook placements could not be loaded.", { cause: placementsError });

  const placements = (placementRows ?? []) as { id: string; client_id: string; va_user_id: string; client_user_id: string; status: string }[];

  const header = (
    <div className="flex items-center gap-4 mb-8">
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
        <NotebookPen className="w-6 h-6 text-white" />
      </div>
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Notebook</h1>
        <p className="text-zinc-400 text-sm mt-1">The shared home for this placement — SOPs, registers, reports and notes, visible to both of you.</p>
      </div>
    </div>
  );

  if (placements.length === 0) {
    return (
      <div>
        {header}
        <div className="border border-zinc-800 rounded-xl bg-zinc-900/40 p-10 text-center">
          <p className="text-zinc-300 font-medium">No active placement yet.</p>
          <p className="text-zinc-500 text-sm mt-1">A Notebook appears here once you&apos;re placed with a {user.role === "va" ? "client" : "VA"}.</p>
        </div>
      </div>
    );
  }

  const active = placements.find((p) => p.id === searchParams.placement) ?? placements[0];

  // Resolve participant + client-org names (metadata).
  const userIds = Array.from(new Set(placements.flatMap((p) => [p.va_user_id, p.client_user_id])));
  const clientIds = Array.from(new Set(placements.map((p) => p.client_id)));
  const [peopleResult, orgsResult] = await withPortalDataTimeout((signal) => Promise.all([
    admin.from("users").select("id, full_name, email").in("id", userIds).abortSignal(signal),
    admin.from("clients").select("id, name").in("id", clientIds).abortSignal(signal),
  ]), "Notebook participants", 8_000);
  if (peopleResult.error || orgsResult.error) {
    throw new Error("Notebook participants could not be loaded.", { cause: peopleResult.error ?? orgsResult.error });
  }
  const people = peopleResult.data;
  const orgs = orgsResult.data;
  const nameOf = (id: string) => {
    const u = (people ?? []).find((x) => x.id === id) as { full_name: string | null; email: string } | undefined;
    return u?.full_name ?? u?.email ?? "Someone";
  };
  const orgName = (id: string) => (orgs ?? []).find((o) => o.id === id)?.name ?? null;

  const placementOptions: PlacementOption[] = placements.map((p) => ({
    id: p.id,
    counterpartName: nameOf(p.va_user_id === user.id ? p.client_user_id : p.va_user_id),
    clientName: orgName(p.client_id),
    status: p.status,
  }));

  const participants: NotebookParticipants = {
    vaUserId: active.va_user_id,
    vaName: nameOf(active.va_user_id),
    clientUserId: active.client_user_id,
    clientName: nameOf(active.client_user_id),
  };

  // PAGE CONTENT — user-scoped client → RLS gates to participants only.
  const sb = await createClient();
  const { data: pageRows, error: pagesError } = await withPortalDataTimeout(
    (signal) => sb
      .from("notebook_pages")
      .select("*")
      .eq("placement_id", active.id)
      .order("sort_order")
      .abortSignal(signal),
    "Notebook pages",
    8_000,
  );
  if (pagesError) throw new Error("Notebook pages could not be loaded.", { cause: pagesError });

  return (
    <div>
      {header}
      <PageIntro id="notebook" />
      <NotebookApp
        placements={placementOptions}
        activePlacementId={active.id}
        pages={(pageRows ?? []) as NotebookPage[]}
        participants={participants}
        currentUserId={user.id}
        initialPageId={typeof searchParams.page === "string" && /^[0-9a-f-]{36}$/iu.test(searchParams.page) ? searchParams.page : null}
      />
    </div>
  );
}
